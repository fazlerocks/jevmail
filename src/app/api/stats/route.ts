import { requireSession } from "@/lib/session";
import { stats } from "@/lib/queries";

export async function GET(request: Request) {
  const { session, userEmail, response } = await requireSession(request);
  if (!session || !userEmail) return response;
  return Response.json(stats(userEmail));
}

