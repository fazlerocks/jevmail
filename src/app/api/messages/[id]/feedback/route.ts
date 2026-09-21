import { requireSession } from "@/lib/session";
import { addFeedback, getMessage } from "@/lib/queries";
import { CATEGORIES, FEEDBACK_KINDS, type FeedbackKind } from "@/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, userEmail, response } = await requireSession(request);
  if (!session || !userEmail) return response;
  const { id } = await params;
  if (!getMessage(id, userEmail)) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { kind?: string; value?: string };
  if (!body.kind || !(FEEDBACK_KINDS as readonly string[]).includes(body.kind)) {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }
  if (body.kind === "corrected_category" && !(CATEGORIES as readonly string[]).includes(body.value ?? "")) {
    return Response.json({ error: "invalid category" }, { status: 400 });
  }
  addFeedback(id, userEmail, body.kind as FeedbackKind, body.value);
  return Response.json({ ok: true, message: getMessage(id, userEmail) });
}

