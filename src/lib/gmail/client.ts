import { google, type gmail_v1 } from "googleapis";

/**
 * Builds a Gmail client from a session access token.
 * The token was issued with gmail.readonly only, so every call through this
 * client is read-only at the OAuth layer regardless of what code asks for.
 */
export function gmailClient(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

export type Gmail = gmail_v1.Gmail;
export type GmailMessage = gmail_v1.Schema$Message;
