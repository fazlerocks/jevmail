import { requireSession } from "@/lib/session";
import { db, schema } from "@/db";
import { gmailClient } from "@/lib/gmail/client";
import { fetchNewMessages } from "@/lib/gmail/sync";
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

  try {
    const gmail = gmailClient(session.accessToken!);
    const { inserted } = await fetchNewMessages(gmail, db);
    fetched = inserted.length;

    for (const m of inserted) {
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
      failed: failed + (gatewayError ? fetched - classified - failed : 0),
      durationMs: Date.now() - started,
      error: gatewayError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", err);
    return Response.json({ error: message, fetched, classified, failed }, { status: 500 });
  } finally {
    g.__jevmailSyncLock = false;
  }
}
