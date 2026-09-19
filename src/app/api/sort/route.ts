import { requireSession } from "@/lib/session";
import { db } from "@/db";
import { unclassifiedMessages } from "@/lib/gmail/sync";
import { kickDrain } from "@/lib/drainer";

/** Start sorting whatever is pending, right now. */
export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;
  const pending = unclassifiedMessages(db).length;
  kickDrain();
  return Response.json({ pending });
}
