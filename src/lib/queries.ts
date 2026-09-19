import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { CATEGORIES, type Category, type FeedbackKind } from "@/db/schema";
import { drainState } from "@/lib/drainer";
import { syncProgress } from "@/lib/gmail/sync";
import { env } from "@/lib/env";

export type Lane = Category | "pending" | "all";

export type MessageView = {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  hasUnsubscribe: boolean;
  isReplyToMe: boolean;
  category: Category | null; // effective (correction wins)
  originalCategory: Category | null;
  categoryProbs: Record<string, number> | null;
  urgency: number | null;
  isPersonal: number | null;
  lowConfidence: boolean;
  corrected: boolean;
  handled: boolean;
  gmailUrl: string;
};

function gmailUrl(threadId: string) {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

type FeedbackSummary = { correctedTo: Category | null; handled: boolean };

function feedbackSummaries(): Map<string, FeedbackSummary> {
  const rows = db.select().from(schema.feedback).orderBy(schema.feedback.id).all();
  const map = new Map<string, FeedbackSummary>();
  for (const r of rows) {
    const s = map.get(r.messageId) ?? { correctedTo: null, handled: false };
    if (r.kind === "corrected_category" && r.value) s.correctedTo = r.value as Category;
    if (r.kind === "handled") s.handled = true;
    if (r.kind === "unhandled") s.handled = false;
    map.set(r.messageId, s);
  }
  return map;
}

// Reads are polled every 300 ms during a live run; a 150 ms cache keeps them cheap
// while writes (which happen in this same process) still show up within a poll.
let viewsCache: { at: number; views: MessageView[] } | null = null;
export function invalidateViews() { viewsCache = null; }

function allViews(): MessageView[] {
  if (viewsCache && Date.now() - viewsCache.at < 150) return viewsCache.views;
  const views = buildViews();
  viewsCache = { at: Date.now(), views };
  return views;
}

function buildViews(): MessageView[] {
  const fb = feedbackSummaries();
  const rows = db
    .select({ m: schema.messages, c: schema.classifications })
    .from(schema.messages)
    .leftJoin(schema.classifications, eq(schema.classifications.messageId, schema.messages.id))
    .orderBy(desc(schema.messages.receivedAt))
    .all();
  return rows.map(({ m, c }) => {
    const s = fb.get(m.id);
    const original = c?.category ?? null;
    return {
      id: m.id,
      threadId: m.threadId,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      subject: m.subject,
      snippet: m.snippet,
      receivedAt: m.receivedAt,
      hasUnsubscribe: m.hasUnsubscribe,
      isReplyToMe: m.isReplyToMe,
      category: s?.correctedTo ?? original,
      originalCategory: original,
      categoryProbs: c?.categoryProbs ?? null,
      urgency: c?.urgency ?? null,
      isPersonal: c?.isPersonal ?? null,
      lowConfidence: c?.lowConfidence ?? false,
      corrected: Boolean(s?.correctedTo && s.correctedTo !== original),
      handled: s?.handled ?? false,
      gmailUrl: gmailUrl(m.threadId),
    };
  });
}

export function listMessages(opts: { lane: Lane; includeHandled: boolean; offset: number; limit: number }) {
  let items = allViews();
  if (!opts.includeHandled) items = items.filter((v) => !v.handled);
  if (opts.lane === "pending") items = items.filter((v) => v.category === null);
  else if (opts.lane !== "all") items = items.filter((v) => v.category === opts.lane);

  if (opts.lane === "needs_reply") {
    items.sort((a, b) => (b.urgency ?? 0) - (a.urgency ?? 0) || b.receivedAt - a.receivedAt);
  }
  const page = items.slice(opts.offset, opts.offset + opts.limit);
  const nextOffset = opts.offset + opts.limit < items.length ? opts.offset + opts.limit : null;
  return { items: page, nextOffset, total: items.length };
}

export function getMessage(id: string): MessageView | null {
  return allViews().find((v) => v.id === id) ?? null;
}

export function addFeedback(messageId: string, kind: FeedbackKind, value?: string) {
  db.insert(schema.feedback).values({ messageId, kind, value: value ?? null, createdAt: Date.now() }).run();
  invalidateViews();
}

export function stats() {
  const all = allViews();
  const lanes: Record<string, number> = { pending: 0 };
  for (const c of CATEGORIES) lanes[c] = 0;
  let classified = 0;
  let corrected = 0;
  for (const v of all) {
    if (v.originalCategory) classified++;
    if (v.corrected) corrected++;
    if (!v.handled) lanes[v.category ?? "pending"]++;
  }
  const agreement = classified === 0 ? 1 : (classified - corrected) / classified;

  const st = db.select().from(schema.syncState).where(eq(schema.syncState.id, 1)).get();
  const tokens = db.select({ n: sql<number>`coalesce(sum(${schema.classifications.inputTokens}), 0)` }).from(schema.classifications).get()?.n ?? 0;
  return {
    lanes,
    classified,
    corrected,
    agreement,
    usd: tokens * env.jevUsdPerInputToken,
    lastSyncedAt: st?.lastSyncedAt ?? null,
    drain: (() => {
      const d = drainState();
      const now = Date.now();
      const elapsedMs = d.run.startedAt ? (d.run.finishedAt ?? now) - d.run.startedAt : 0;
      const perSec = elapsedMs > 500 ? d.run.classified / (elapsedMs / 1000) : 0;
      return {
        ...d,
        run: { ...d.run, elapsedMs, perSec },
        nextInMs: d.nextTickAt ? Math.max(0, d.nextTickAt - now) : null,
        burst: env.jevBurst,
        intervalMs: env.jevDrainIntervalMs,
        concurrency: env.jevConcurrency,
      };
    })(),
    sync: syncProgress(),
  };
}
