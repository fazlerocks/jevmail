import { inArray, eq, isNull } from "drizzle-orm";
import type { Gmail } from "./client";
import { parseMessage, type ParsedMessage } from "./parse";
import { type Db, schema } from "@/db";
import { env } from "@/lib/env";

/**
 * READ-ONLY. The only Gmail methods used anywhere in this app:
 *   users.messages.list, users.messages.get, users.threads.list,
 *   users.history.list, users.getProfile
 *
 * Quota notes (Gmail: 15,000 units per user per minute):
 *   messages.list 5, messages.get 5, threads.list 10, history.list 2, getProfile 1.
 *   We fetch in batches of 10 with a floor of 600 ms per batch, which is about
 *   5,000 units per minute, well under the limit.
 */

const BATCH = 20; // 20 x messages.get (5 units) per 600 ms = 10,000 units/min, under the 15,000 limit
const BATCH_FLOOR_MS = 600;

export type SyncProgress = { active: boolean; phase: "idle" | "listing" | "fetching"; done: number; total: number; startedAt: number | null };
const sp = globalThis as unknown as { __jevmailSyncProgress?: SyncProgress };
export function syncProgress(): SyncProgress {
  return sp.__jevmailSyncProgress ?? { active: false, phase: "idle", done: 0, total: 0, startedAt: null };
}
function setProgress(patch: Partial<SyncProgress>) {
  sp.__jevmailSyncProgress = { ...syncProgress(), ...patch };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } };
  return Number(e?.response?.status ?? e?.status ?? e?.code) || undefined;
}

function isQuotaError(err: unknown): boolean {
  const status = statusOf(err);
  const msg = String((err as Error)?.message ?? "");
  return status === 429 || (status === 403 && /quota|rate ?limit/i.test(msg));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const waits = [15_000, 30_000, 60_000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusOf(err);
      const retryable = isQuotaError(err) || (status !== undefined && status >= 500);
      if (!retryable || attempt >= waits.length) throw err;
      console.warn(`[gmail] ${label} got ${status}, waiting ${waits[attempt] / 1000}s (attempt ${attempt + 1})`);
      await sleep(waits[attempt]);
    }
  }
}

/** The newest `limit` inbox messages, newest first. Gmail pages at 500. */
async function listInboxIds(gmail: Gmail, limit: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < limit) {
    const res = await withRetry(
      () => gmail.users.messages.list({ userId: "me", q: "in:inbox", maxResults: Math.min(500, limit - ids.length), pageToken }),
      "messages.list",
    );
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return ids.slice(0, limit);
}

async function listHistoryIds(gmail: Gmail, startHistoryId: string): Promise<{ ids: string[]; historyId: string }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let historyId = startHistoryId;
  do {
    const res = await withRetry(
      () =>
        gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          labelId: "INBOX",
          maxResults: 500,
          pageToken,
        }),
      "history.list",
    );
    for (const h of res.data.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id);
      }
    }
    if (res.data.historyId) historyId = res.data.historyId;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return { ids: [...ids], historyId };
}

async function currentHistoryId(gmail: Gmail): Promise<string> {
  const res = await withRetry(() => gmail.users.getProfile({ userId: "me" }), "getProfile");
  return String(res.data.historyId);
}

/** Thread ids the user has sent mail in recently. One paginated call instead of one call per message. */
async function sentThreadIds(gmail: Gmail, days: number): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await withRetry(
      () =>
        gmail.users.threads.list({
          userId: "me",
          q: `in:sent newer_than:${days}d`,
          maxResults: 500,
          pageToken,
        }),
      "threads.list",
    );
    for (const t of res.data.threads ?? []) if (t.id) ids.add(t.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

function getSyncState(db: Db) {
  return db.select().from(schema.syncState).where(eq(schema.syncState.id, 1)).get();
}

function setSyncState(db: Db, lastHistoryId: string | null) {
  db.insert(schema.syncState)
    .values({ id: 1, lastHistoryId, lastSyncedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.syncState.id,
      set: { lastHistoryId, lastSyncedAt: Date.now() },
    })
    .run();
}

export type StoredMessage = ParsedMessage & { isReplyToMe: boolean };

export type SyncFetchResult = {
  inserted: StoredMessage[];
  /** Candidate messages not fetched this run because of the per-run cap. Sync again to continue. */
  remaining: number;
  mode: "full" | "incremental";
};

/**
 * Pulls new inbox messages into the `messages` table, saving each batch as it
 * lands so a mid-run failure keeps its progress. Does not classify.
 */
export async function fetchNewMessages(gmail: Gmail, db: Db): Promise<SyncFetchResult> {
  setProgress({ active: true, phase: "listing", done: 0, total: 0, startedAt: Date.now() });
  try {
    return await fetchNewMessagesInner(gmail, db);
  } finally {
    setProgress({ active: false, phase: "idle" });
  }
}

async function fetchNewMessagesInner(gmail: Gmail, db: Db): Promise<SyncFetchResult> {
  const state = getSyncState(db);
  let candidateIds: string[];
  let nextHistoryId: string;
  let mode: SyncFetchResult["mode"];

  if (state?.lastHistoryId) {
    try {
      const r = await listHistoryIds(gmail, state.lastHistoryId);
      candidateIds = r.ids;
      nextHistoryId = r.historyId;
      mode = "incremental";
    } catch (err) {
      if (statusOf(err) === 404) {
        console.warn("[gmail] history id too old, falling back to full sync");
        setSyncState(db, null);
        return fetchNewMessagesInner(gmail, db);
      }
      throw err;
    }
  } else {
    // Take the history id before listing so nothing arriving mid-sync is missed.
    nextHistoryId = await currentHistoryId(gmail);
    candidateIds = await listInboxIds(gmail, env.syncLimit);
    mode = "full";
  }

  const known = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += 500) {
    const slice = candidateIds.slice(i, i + 500);
    for (const r of db.select({ id: schema.messages.id }).from(schema.messages).where(inArray(schema.messages.id, slice)).all()) {
      known.add(r.id);
    }
  }
  const newIds = candidateIds.filter((id) => !known.has(id));
  const toFetch = newIds.slice(0, env.syncLimit);
  const remaining = newIds.length - toFetch.length;

  const sent = toFetch.length ? await sentThreadIds(gmail, 60) : new Set<string>();
  setProgress({ phase: "fetching", done: 0, total: toFetch.length });

  const inserted: StoredMessage[] = [];
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const started = Date.now();
    const batch = await Promise.all(
      toFetch.slice(i, i + BATCH).map(async (id) => {
        const res = await withRetry(
          () => gmail.users.messages.get({ userId: "me", id, format: "full" }),
          "messages.get",
        );
        // history.list can report messages later removed from the inbox; keep only current inbox mail
        if (mode === "incremental" && !res.data.labelIds?.includes("INBOX")) return null;
        return parseMessage(res.data);
      }),
    );
    const now = Date.now();
    for (const m of batch) {
      if (!m) continue;
      const row: StoredMessage = { ...m, isReplyToMe: sent.has(m.threadId) };
      db.insert(schema.messages).values({ ...row, syncedAt: now }).onConflictDoNothing().run();
      inserted.push(row);
    }
    setProgress({ done: Math.min(toFetch.length, i + BATCH) });
    const elapsed = Date.now() - started;
    if (elapsed < BATCH_FLOOR_MS && i + BATCH < toFetch.length) await sleep(BATCH_FLOOR_MS - elapsed);
  }

  // Only advance the bookmark once every candidate has been pulled; otherwise
  // the next run re-lists and skips what is already stored.
  if (remaining === 0) setSyncState(db, nextHistoryId);
  else setSyncState(db, state?.lastHistoryId ?? null);

  return { inserted, remaining, mode };
}

/** Messages stored earlier that never got a classification (gateway errors, interrupted runs). */
export function unclassifiedMessages(db: Db): StoredMessage[] {
  return db
    .select({ m: schema.messages })
    .from(schema.messages)
    .leftJoin(schema.classifications, eq(schema.classifications.messageId, schema.messages.id))
    .where(isNull(schema.classifications.messageId))
    .all()
    .map(({ m }) => m);
}
