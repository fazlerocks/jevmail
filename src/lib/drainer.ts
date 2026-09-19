import { db, schema } from "@/db";
import { unclassifiedMessages, type StoredMessage } from "@/lib/gmail/sync";
import { classifyMessage, GatewayForbiddenError, GatewayRateLimitedError } from "@/lib/classify";
import { env } from "@/lib/env";
import type { Category } from "@/db/schema";

/**
 * Works through the Pending backlog with Jev.
 * - Free tier: JEV_BURST (5) per JEV_DRAIN_INTERVAL_MS tick, concurrency 1.
 * - Paid tier: set JEV_BURST high and JEV_CONCURRENCY ~10 for realtime sorting.
 * A "run" spans from the first pending message seen until the backlog is empty,
 * so the UI can show one continuous progress bar across several ticks.
 */

export type RecentDecision = { id: string; from: string; subject: string; category: Category; confidence: number; at: number };

export type RunState = {
  active: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  classified: number;
  failed: number;
  inputTokens: number;
  usd: number;
  rateLimited: boolean;
  error: string | null;
  recent: RecentDecision[];
};

export type DrainState = {
  running: boolean;
  inTick: boolean;
  lastTickAt: number | null;
  nextTickAt: number | null;
  run: RunState;
};

const emptyRun = (): RunState => ({
  active: false, startedAt: null, finishedAt: null, total: 0, classified: 0, failed: 0,
  inputTokens: 0, usd: 0, rateLimited: false, error: null, recent: [],
});

const g = globalThis as unknown as { __jevmailDrain?: { timer: NodeJS.Timeout | null; state: DrainState } };

function ensure() {
  if (!g.__jevmailDrain) {
    g.__jevmailDrain = { timer: null, state: { running: false, inTick: false, lastTickAt: null, nextTickAt: null, run: emptyRun() } };
  }
  return g.__jevmailDrain;
}

export function drainState(): DrainState {
  return ensure().state;
}

async function classifyOne(m: StoredMessage, run: RunState) {
  const { inputTokens, ...c } = await classifyMessage(m);
  db.insert(schema.classifications)
    .values({ messageId: m.id, ...c, inputTokens, classifiedAt: Date.now() })
    .onConflictDoNothing()
    .run();
  run.classified++;
  run.inputTokens += inputTokens;
  run.usd = run.inputTokens * env.jevUsdPerInputToken;
  const top = Object.entries(c.categoryProbs).sort((a, b) => b[1] - a[1])[0];
  run.recent = [{ id: m.id, from: m.fromName || m.fromEmail, subject: m.subject, category: c.category, confidence: top?.[1] ?? 1, at: Date.now() }, ...run.recent].slice(0, 40);
}

/** Classify up to `limit` pending messages with a small worker pool. */
export async function drainOnce(limit = env.jevBurst): Promise<{ classified: number; rateLimited: boolean; error: string | null }> {
  const { state } = ensure();
  const pending = unclassifiedMessages(db).slice(0, limit);
  const run = state.run;
  let classified = 0;
  let rateLimited = false;
  let error: string | null = null;
  let next = 0;

  const worker = async () => {
    while (next < pending.length && !rateLimited && !error) {
      const m = pending[next++];
      try {
        await classifyOne(m, run);
        classified++;
      } catch (err) {
        if (err instanceof GatewayRateLimitedError) rateLimited = true;
        else if (err instanceof GatewayForbiddenError) error = err.message;
        else {
          console.error("[drain]", m.id, err);
          run.failed++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(env.jevConcurrency, pending.length || 1) }, worker));
  run.rateLimited = rateLimited;
  run.error = error;
  return { classified, rateLimited, error };
}

async function tick(auto = false) {
  const d = ensure();
  const { state } = d;
  if (state.inTick) return;
  // A timer tick may continue a run but only starts one when auto-sort is on.
  if (auto && !state.run.active && !env.jevAutoSort) return;
  state.inTick = true;
  state.lastTickAt = Date.now();
  try {
    const pendingCount = unclassifiedMessages(db).length;
    if (pendingCount > 0) {
      if (!state.run.active) {
        state.run = { ...emptyRun(), active: true, startedAt: Date.now(), total: pendingCount };
      } else {
        state.run.total = state.run.classified + state.run.failed + pendingCount;
      }
      const r = await drainOnce();
      const left = unclassifiedMessages(db).length;
      console.log(
        `[drain] classified ${r.classified}, ${left} pending` +
          (r.rateLimited ? ` (free-tier limit, next in ${Math.round(env.jevDrainIntervalMs / 60000)} min)` : "") +
          (r.error ? ` error: ${r.error}` : ""),
      );
      if (left === 0 || r.error) {
        state.run.active = false;
        state.run.finishedAt = Date.now();
        if (left === 0 && state.run.classified > 0) {
          const secs = ((state.run.finishedAt - (state.run.startedAt ?? state.run.finishedAt)) / 1000).toFixed(1);
          console.log(`[drain] run complete: ${state.run.classified} sorted in ${secs}s, $${state.run.usd.toFixed(4)}`);
        }
      } else if (!r.rateLimited && left > 0) {
        // Paid tier: keep going right away instead of waiting for the timer.
        state.inTick = false;
        return tick();
      }
    }
  } catch (err) {
    state.run.error = err instanceof Error ? err.message : String(err);
    state.run.active = false;
  } finally {
    state.inTick = false;
    state.nextTickAt = Date.now() + env.jevDrainIntervalMs;
  }
}

/** Start a tick now if one is not already running. Called after a sync. */
export function kickDrain() {
  if (!env.hasGatewayKey()) return;
  void tick();
}

export function startDrainer() {
  const d = ensure();
  if (d.timer || !env.hasGatewayKey() || env.jevDrainIntervalMs <= 0) return;
  d.state.running = true;
  d.state.nextTickAt = Date.now() + env.jevDrainIntervalMs;
  d.timer = setInterval(() => void tick(true), env.jevDrainIntervalMs);
  d.timer.unref();
  console.log(`[drain] started: up to ${env.jevBurst} messages every ${Math.round(env.jevDrainIntervalMs / 1000)}s, concurrency ${env.jevConcurrency}`);
}
