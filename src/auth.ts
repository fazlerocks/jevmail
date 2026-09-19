import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Read-only Gmail access. The only Gmail scope requested is gmail.readonly.
 * Never add gmail.modify, gmail.labels, or mail.google.com here.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshTokenExpired" | "RefreshFailed";
  }
}

type GoogleToken = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // unix seconds
  error?: "RefreshTokenExpired" | "RefreshFailed";
};

async function refreshAccessToken(token: GoogleToken): Promise<GoogleToken> {
  if (!token.refresh_token) return { ...token, error: "RefreshTokenExpired" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    // invalid_grant = refresh token revoked or expired (7 days in Google "Testing" mode)
    return {
      ...token,
      error: data.error === "invalid_grant" ? "RefreshTokenExpired" : "RefreshFailed",
    };
  }
  return {
    ...token,
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    refresh_token: data.refresh_token ?? token.refresh_token,
    error: undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      const t = token as typeof token & GoogleToken;
      if (account) {
        return {
          ...t,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
          error: undefined,
        };
      }
      const now = Math.floor(Date.now() / 1000);
      if (t.expires_at && now < t.expires_at - 60) return t;
      return { ...t, ...(await refreshAccessToken(t)) };
    },
    async session({ session, token }) {
      const t = token as typeof token & GoogleToken;
      session.accessToken = t.access_token;
      session.error = t.error;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
