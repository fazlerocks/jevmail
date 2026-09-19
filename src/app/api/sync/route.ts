import { requireSession } from "@/lib/session";
import { db, schema } from "@/db";
import { gmailClient } from "@/lib/gmail/client";
import { fetchNewMessages, unclassifiedMessages } from "@/lib/gmail/sync";
import { classifyMessage, GatewayForbiddenError } from "@/lib/classify";
import { env } from "@/lib/env";

const g = globalThis as unknown as { __jevmailSyncLock?: boolean };

export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (!env.hasGatewayKey()) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not set" }, { status: 400 });
  }
  if (g.__jevmailSyncLock) return Response.json({ error: "sync already running" }, { status: 409 });
  g.__jevmailSyncLock = true;

  const started = Date.now();
  let fetched = 0;
  let classified = 0;
  let failed = 0;
  let gatewayError: string | null = null;
  let remaining = 0;

  try {
    const gmail = gmailClient(session.accessToken!);
    const result = await fetchNewMessages(gmail, db);
    fetched = result.inserted.length;
    remaining = result.remaining;

    // Retry anything stored earlier that still lacks a classification, then the new ones.
    const toClassify = [...unclassifiedMessages(db).filter((m) => !result.inserted.some((n) => n.id === m.id)), ...result.inserted];

    for (const m of toClassify) {
      if (gatewayError) break;
      try {
        const c = await classifyMessage(m);
        db.insert(schema.classifications)
          .values({ messageId: m.id, ...c, classifiedAt: Date.now() })
          .onConflictDoNothing()
          .run();
        classified++;
      } catch (err) {
        if (err instanceof GatewayForbiddenError) {
          gatewayError = err.message;
        } else {
          console.error("[classify]", m.id, err);
          failed++;
        }
      }
    }
    return Response.json({
      fetched,
      classified,
      failed: failed + (gatewayError ? Math.max(0, toClassify.length - classified - failed) : 0),
      remaining,
      durationMs: Date.now() - started,
      error: gatewayError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", err);
    return Response.json({ error: message, fetched, classified, failed, remaining }, { status: 500 });
  } finally {
    g.__jevmailSyncLock = false;
  }
}
