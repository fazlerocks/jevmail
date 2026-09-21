import { requireSession } from "@/lib/session";
import { db } from "@/db";
import { gmailClient } from "@/lib/gmail/client";
import { fetchNewMessages, unclassifiedMessages } from "@/lib/gmail/sync";
import { kickDrain } from "@/lib/drainer";
import { env } from "@/lib/env";

const g = globalThis as unknown as { __jevmailSyncLocks?: Set<string> };
const syncLocks = (g.__jevmailSyncLocks ??= new Set<string>());

/** Pulls new mail, then hands classification to the drainer so the page can watch it happen. */
export async function POST(request: Request) {
  const { session, accessToken, userEmail, response } = await requireSession(request);
  if (!session || !userEmail) return response;
  if (!accessToken) return Response.json({ error: "missing or expired access token; please re-authenticate" }, { status: 401 });
  if (!env.hasGatewayKey()) return Response.json({ error: "AI_GATEWAY_API_KEY is not set" }, { status: 400 });
  if (syncLocks.has(userEmail)) return Response.json({ error: "sync already running" }, { status: 409 });
  syncLocks.add(userEmail);

  const started = Date.now();
  try {
    const gmail = gmailClient(accessToken);
    const older = new URL(request.url).searchParams.get("older") === "1";
    const result = await fetchNewMessages(gmail, db, userEmail, older, kickDrain);
    const pending = unclassifiedMessages(db, userEmail).length;
    console.log(`[sync] user=${userEmail} fetched ${result.inserted.length}, ${pending} pending${result.remaining ? `, ${result.remaining} more to pull` : ""}`);
    kickDrain();
    return Response.json({ fetched: result.inserted.length, pending, remaining: result.remaining, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", err);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    syncLocks.delete(userEmail);
  }
}

