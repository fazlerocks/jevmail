import { requireSession } from "@/lib/session";
import { db } from "@/db";
import { unclassifiedMessages } from "@/lib/gmail/sync";
import { kickDrain } from "@/lib/drainer";

/** Start sorting whatever is pending, right now. */
export async function POST(request: Request) {
  const { session, userEmail, response } = await requireSession(request);
  if (!session || !userEmail) return response;
  const pending = unclassifiedMessages(db, userEmail).length;
  kickDrain();
  return Response.json({ pending });
}

