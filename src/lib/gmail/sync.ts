import { inArray, eq } from "drizzle-orm";
import type { Gmail } from "./client";
import { parseMessage, type ParsedMessage } from "./parse";
import { type Db, schema } from "@/db";
import { env } from "@/lib/env";

/**
 * READ-ONLY. The only Gmail methods used anywhere in this app:
 *   users.messages.list, users.messages.get, users.threads.get,
 *   users.history.list, users.getProfile
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } };
  return Number(e?.response?.status ?? e?.status ?? e?.code) || undefined;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusOf(err);
      const retryable = status === 429 || status === 403 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= 3) throw err;
      console.warn(`[gmail] ${label} got ${status}, retry ${attempt} in ${delay}ms`);
      await sleep(delay);
      delay *= 2;
    }
  }
}

async function chunked<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function listInboxIds(gmail: Gmail, days: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(
      () =>
        gmail.users.messages.list({
          userId: "me",
          q: `in:inbox newer_than:${days}d`,
          maxResults: 100,
          pageToken,
        }),
      "messages.list",
    );
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
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

async function threadHasSent(gmail: Gmail, threadId: string): Promise<boolean> {
  const res = await withRetry(
    () => gmail.users.threads.get({ userId: "me", id: threadId, format: "minimal" }),
    "threads.get",
  );
  return (res.data.messages ?? []).some((m) => m.labelIds?.includes("SENT"));
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

export type SyncFetchResult = {
  inserted: (ParsedMessage & { isReplyToMe: boolean })[];
  mode: "full" | "incremental";
};

/**
 * Pulls new inbox messages into the `messages` table. Does not classify.
 */
export async function fetchNewMessages(gmail: Gmail, db: Db): Promise<SyncFetchResult> {
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
        return fetchNewMessages(gmail, db);
      }
      throw err;
    }
  } else {
    // Take the history id before listing so nothing arriving mid-sync is missed.
    nextHistoryId = await currentHistoryId(gmail);
    candidateIds = await listInboxIds(gmail, env.syncLookbackDays);
    mode = "full";
  }

  const known = candidateIds.length
    ? new Set(
        db
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(inArray(schema.messages.id, candidateIds))
          .all()
          .map((r) => r.id),
      )
    : new Set<string>();
  const newIds = candidateIds.filter((id) => !known.has(id));

  const fetched = await chunked(newIds, 10, async (id) => {
    const res = await withRetry(
      () => gmail.users.messages.get({ userId: "me", id, format: "full" }),
      "messages.get",
    );
    // history.list can report messages later removed from the inbox; keep only current inbox mail
    if (mode === "incremental" && !res.data.labelIds?.includes("INBOX")) return null;
    return parseMessage(res.data);
  });
  const parsed = fetched.filter((m): m is ParsedMessage => m !== null);

  const withReply = await chunked(parsed, 10, async (m) => ({
    ...m,
    isReplyToMe: await threadHasSent(gmail, m.threadId).catch(() => false),
  }));

  const now = Date.now();
  for (const m of withReply) {
    db.insert(schema.messages)
      .values({ ...m, syncedAt: now })
      .onConflictDoNothing()
      .run();
  }
  setSyncState(db, nextHistoryId);

  return { inserted: withReply, mode };
}
