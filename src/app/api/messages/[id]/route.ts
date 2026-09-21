import { requireSession } from "@/lib/session";
import { getMessage } from "@/lib/queries";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, userEmail, response } = await requireSession(req);
  if (!session || !userEmail) return response;
  const { id } = await params;
  const view = getMessage(id, userEmail);
  if (!view) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(view);
}

