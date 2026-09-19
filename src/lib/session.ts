import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return { session: null, response: Response.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  return { session, response: null };
}
