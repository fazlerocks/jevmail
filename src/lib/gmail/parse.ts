import { convert } from "html-to-text";
import { parseOneAddress } from "email-addresses";
import type { gmail_v1 } from "googleapis";
import { env } from "@/lib/env";

export type ParsedMessage = {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  fromDomain: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  hasUnsubscribe: boolean;
};

type Part = gmail_v1.Schema$MessagePart;

function header(parts: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = parts?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBody(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findPart(part: Part | undefined, mime: string): Part | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return undefined;
}

function extractBody(payload: Part | undefined): string {
  const plain = findPart(payload, "text/plain");
  if (plain) return decodeBody(plain.body?.data);
  const html = findPart(payload, "text/html");
  if (html) {
    return convert(decodeBody(html.body?.data), {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
      ],
    });
  }
  return "";
}

export function cleanText(s: string, max = env.maxBodyChars): string {
  const collapsed = s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed;
}

export function parseMessage(m: gmail_v1.Schema$Message): ParsedMessage {
  const headers = m.payload?.headers ?? [];
  const fromRaw = header(headers, "From");
  const parsed = parseOneAddress(fromRaw);
  const mailbox = parsed && parsed.type === "mailbox" ? parsed : null;
  const fromEmail = (mailbox?.address ?? fromRaw).toLowerCase().trim();
  const fromName = mailbox?.name ?? (fromRaw.includes("<") ? fromRaw.split("<")[0].trim() : fromEmail);
  const fromDomain = fromEmail.includes("@") ? fromEmail.split("@")[1] : "";

  let body = "";
  try {
    body = extractBody(m.payload ?? undefined);
  } catch {
    body = "";
  }
  if (!body.trim()) body = m.snippet ?? "";

  return {
    id: m.id!,
    threadId: m.threadId ?? m.id!,
    fromName: fromName.replace(/^"|"$/g, ""),
    fromEmail,
    fromDomain,
    subject: header(headers, "Subject"),
    snippet: cleanText(body),
    receivedAt: Number(m.internalDate ?? Date.now()),
    hasUnsubscribe: Boolean(header(headers, "List-Unsubscribe")),
  };
}
