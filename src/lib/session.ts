import { auth } from "@/auth";
import { getToken } from "next-auth/jwt";

export async function requireSession(request?: Request) {
  // 1. Verify Origin for CSRF mitigation on state-modifying requests
  if (request && ["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return {
            session: null,
            accessToken: null,
            userEmail: null,
            response: Response.json({ error: "cross-origin request forbidden" }, { status: 403 }),
          };
        }
      } catch {
        return {
          session: null,
          accessToken: null,
          userEmail: null,
          response: Response.json({ error: "invalid origin header" }, { status: 403 }),
        };
      }
    }
  }

  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userEmail || session?.error) {
    return {
      session: null,
      accessToken: null,
      userEmail: null,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  let accessToken: string | null = null;
  if (request) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.AUTH_SECRET,
      });
      if (token && typeof token.access_token === "string") {
        accessToken = token.access_token;
      }
    } catch (err) {
      console.error("[session] error retrieving token:", err);
    }
  }

  return { session, accessToken, userEmail, response: null };
}
