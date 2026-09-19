import { requireSession } from "@/lib/session";
import { getMessage } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const view = getMessage(id);
  if (!view) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(view);
}
