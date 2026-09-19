import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMessage, type ClassifyInput } from "./classify";

const hasKey = Boolean(process.env.AI_GATEWAY_API_KEY);

const base = { receivedAt: Date.now(), hasUnsubscribe: false, isReplyToMe: false };

const samples: { name: string; expect: string[]; input: ClassifyInput }[] = [
  {
    name: "colleague asking a direct question",
    expect: ["needs_reply"],
    input: {
      ...base,
      isReplyToMe: true,
      fromName: "Priya Nair",
      fromEmail: "priya@example-corp.com",
      subject: "Re: launch date for the billing page?",
      snippet: "Hey, quick one. Are we still good to ship the billing page on Thursday? Marketing wants to schedule the post. Let me know today if possible.",
    },
  },
  {
    name: "newsletter with unsubscribe header",
    expect: ["promotional"],
    input: {
      ...base,
      hasUnsubscribe: true,
      fromName: "The Weekly Byte",
      fromEmail: "hello@weeklybyte.io",
      subject: "This week: 10 tools every dev should try",
      snippet: "Welcome back to The Weekly Byte. This week we cover ten tools, a big Postgres release, and more. Unsubscribe at any time.",
    },
  },
  {
    name: "cold sales outreach",
    expect: ["sales"],
    input: {
      ...base,
      fromName: "Jordan from ScaleOps",
      fromEmail: "jordan@scaleops.example",
      subject: "Quick question about your infra costs",
      snippet: "Hi there, I noticed your team is growing. We help companies like yours cut cloud spend by 40%. Do you have 15 minutes this week for a quick call?",
    },
  },
  {
    name: "phishing attempt",
    expect: ["spam"],
    input: {
      ...base,
      fromName: "Account Security",
      fromEmail: "no-reply@secure-verify-login.xyz",
      subject: "URGENT: your account will be suspended",
      snippet: "We detected unusual activity. Verify your identity within 24 hours by entering your password at the link below or your account will be permanently closed.",
    },
  },
  {
    name: "ambiguous: receipt that mentions a problem",
    expect: ["promotional", "needs_reply"],
    input: {
      ...base,
      fromName: "Acme Billing",
      fromEmail: "billing@acme.example",
      subject: "Your invoice #4821 and a payment issue",
      snippet: "Your invoice for September is attached. Note: the card on file was declined. Please update your payment method to avoid service interruption.",
    },
  },
];

for (const s of samples) {
  test(`classify: ${s.name}`, { skip: !hasKey && "AI_GATEWAY_API_KEY not set" }, async () => {
    const c = await classifyMessage(s.input);
    assert.ok(s.expect.includes(c.category), `expected one of ${s.expect.join("/")}, got ${c.category} (${JSON.stringify(c.categoryProbs)})`);
    assert.ok(c.urgency >= 1 && c.urgency <= 5);
    assert.ok(c.isPersonal >= 0 && c.isPersonal <= 1);
  });
}
