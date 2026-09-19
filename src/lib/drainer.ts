import { db, schema } from "@/db";
import { unclassifiedMessages } from "@/lib/gmail/sync";
import { classifyMessage, GatewayForbiddenError, GatewayRateLimitedError } from "@/lib/classify";
import { env } from "@/lib/env";

/**
 * Trickles the Pending backlog through Jev within the free-tier rate limit:
 * every `jevDrainIntervalMs`, classify up to `jevBurst` messages, stop early on 429.
 * Runs inside the Next.js server process; started from instrumentation.ts.
 */

export type DrainState = {
  running: boolean;
  inTick: boolean;
  lastTickAt: number | null;
  nextTickAt: number | null;
  lastResult: { classified: number; rateLimited: boolean; error: string | null } | null;
};

const g = globalThis as unknown as { __jevmailDrain?: { timer: NodeJS.Timeout; state: DrainState } };

export function drainState(): DrainState {
  return g.__jevmailDrain?.state ?? { running: false, inTick: false, lastTickAt: null, nextTickAt: null, lastResult: null };
}

export async function drainOnce(limit = env.jevBurst): Promise<NonNullable<DrainState["lastResult"]>> {
  const pending = unclassifiedMessages(db).slice(0, limit);
  let classified = 0;
  for (const m of pending) {
    try {
      const c = await classifyMessage(m);
      db.insert(schema.classifications)
        .values({ messageId: m.id, ...c, classifiedAt: Date.now() })
        .onConflictDoNothing()
        .run();
      classified++;
    } catch (err) {
      if (err instanceof GatewayRateLimitedError) return { classified, rateLimited: true, error: null };
      if (err instanceof GatewayForbiddenError) return { classified, rateLimited: false, error: err.message };
      console.error("[drain]", m.id, err);
    }
  }
  return { classified, rateLimited: false, error: null };
}

export function startDrainer() {
  if (g.__jevmailDrain || !env.hasGatewayKey() || env.jevDrainIntervalMs <= 0) return;
  const state: DrainState = { running: true, inTick: false, lastTickAt: null, nextTickAt: Date.now() + env.jevDrainIntervalMs, lastResult: null };

  const tick = async () => {
    if (state.inTick) return;
    state.inTick = true;
    state.lastTickAt = Date.now();
    try {
      if (unclassifiedMessages(db).length > 0) state.lastResult = await drainOnce();
    } catch (err) {
      state.lastResult = { classified: 0, rateLimited: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      state.inTick = false;
      state.nextTickAt = Date.now() + env.jevDrainIntervalMs;
    }
  };

  const timer = setInterval(tick, env.jevDrainIntervalMs);
  timer.unref();
  g.__jevmailDrain = { timer, state };
  console.log(`[drain] started: up to ${env.jevBurst} messages every ${Math.round(env.jevDrainIntervalMs / 1000)}s`);
}
