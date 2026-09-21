import { requireSession } from "@/lib/session";
import { listMessages, type Lane } from "@/lib/queries";
import { CATEGORIES } from "@/db/schema";

export async function GET(request: Request) {
  const { session, userEmail, response } = await requireSession(request);
  if (!session || !userEmail) return response;
  const url = new URL(request.url);
  const laneParam = url.searchParams.get("lane") ?? "needs_reply";
  const lane: Lane = ([...CATEGORIES, "pending", "all"] as string[]).includes(laneParam)
    ? (laneParam as Lane)
    : "needs_reply";
  const includeHandled = url.searchParams.get("includeHandled") === "true";
  const offset = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
  // Cap query limit safely to prevent resource exhaustion attacks
  const limit = Math.min(1_000, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  return Response.json(listMessages({ userEmail, lane, includeHandled, offset, limit }));
}

