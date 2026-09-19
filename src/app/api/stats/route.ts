import { requireSession } from "@/lib/session";
import { stats } from "@/lib/queries";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;
  return Response.json(stats());
}
