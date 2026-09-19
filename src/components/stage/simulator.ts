import type { MessageView } from "@/lib/queries";
import type { Category, FeedbackKind } from "@/db/schema";
import type { StageApi, StageStats, Decision } from "./types";

/** In-memory stand-in for Gmail + Jev so the stage can be previewed without credentials. */
const SENDERS: [string, string, Category][] = [
  ["Priya Nair", "priya@acme.co", "needs_reply"], ["Marcus Lee", "marcus@studio.io", "needs_reply"], ["Ana Souza", "ana@ferra.dev", "needs_reply"],
  ["ICICI Bank", "alerts@icicibank.com", "updates"], ["Furlenco", "no-reply@furlenco.com", "updates"], ["Amazon", "order-update@amazon.in", "updates"], ["WaterOn", "alerts@wateron.in", "updates"], ["GitHub", "noreply@github.com", "updates"],
  ["The Weekly Byte", "hello@weeklybyte.io", "promotional"], ["Zomato", "offers@zomato.com", "promotional"], ["Figma", "news@figma.com", "promotional"], ["Notion", "team@mail.notion.so", "promotional"],
  ["Jordan at ScaleOps", "jordan@scaleops.example", "sales"], ["Sam from Growthly", "sam@growthly.example", "sales"],
  ["Account Security", "no-reply@secure-verify-login.xyz", "spam"], ["Prize Desk", "win@lucky-draw.example", "spam"],
];
const SUBJECTS: Record<Category, string[]> = {
  needs_reply: ["Re: launch date for billing page?", "Quick question about the API", "Can we move Thursday's call?", "Feedback on the draft"],
  updates: ["Transaction alert for your card", "Your delivery is on its way", "Payment successful", "Leak alert from your water meter", "[repo] New pull request"],
  promotional: ["This week: 10 tools to try", "40% off ends tonight", "What's new in September", "Your monthly digest"],
  sales: ["Quick question about your infra costs", "15 minutes this week?", "Following up on my last note"],
  spam: ["URGENT: your account will be suspended", "You have won a prize", "Verify your identity now"],
};
const WEIGHTS: [Category, number][] = [["needs_reply", 0.06], ["updates", 0.44], ["promotional", 0.36], ["sales", 0.08], ["spam", 0.06]];

function pick<T>(arr: T[], i: number) { return arr[i % arr.length]; }
function weightedCategory(r: number): Category {
  let acc = 0;
  for (const [c, w] of WEIGHTS) { acc += w; if (r < acc) return c; }
  return "updates";
}

export class Simulator implements StageApi {
  private msgs: (MessageView & { truth: Category; fetched: boolean })[] = [];
  private syncState: StageStats["sync"] = { active: false, phase: "idle", done: 0, total: 0, startedAt: null };
  private run: StageStats["drain"]["run"] = { active: false, startedAt: null, finishedAt: null, total: 0, classified: 0, usd: 0, rateLimited: false, error: null, elapsedMs: 0, perSec: 0, recent: [] };
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSyncedAt: number | null = null;

  constructor(private total: number, private rate: number) {
    this.grow(total);
  }

  /** Add `n` older messages behind whatever exists. */
  private grow(n: number) {
    const start = this.msgs.length;
    const now = Date.now();
    for (let i = start; i < start + n; i++) {
      const truth = weightedCategory(((i * 7919) % 1000) / 1000);
      const s = SENDERS.filter((x) => x[2] === truth);
      const [name, email] = pick(s, i);
      this.msgs.push({
        id: `sim-${i}`, threadId: `t-${i}`, fromName: name, fromEmail: email, subject: pick(SUBJECTS[truth], i * 31),
        snippet: "Simulated message body for the preview. Nothing here came from Gmail.", receivedAt: now - i * 4 * 60_000,
        hasUnsubscribe: truth === "promotional", isReplyToMe: truth === "needs_reply", category: null, originalCategory: null,
        categoryProbs: null, urgency: null, isPersonal: null, lowConfidence: false, corrected: false, handled: false,
        gmailUrl: "#", truth, fetched: false,
      });
    }
  }

  async load(showDone: boolean) {
    const items: MessageView[] = this.msgs.filter((m) => m.fetched && (showDone || !m.handled)).map((m) => {
      const { truth, fetched, ...view } = m;
      void truth; void fetched;
      return view;
    });
    const lanes: Record<string, number> = { pending: 0, needs_reply: 0, updates: 0, promotional: 0, sales: 0, spam: 0 };
    for (const m of this.msgs) if (m.fetched && !m.handled) lanes[m.category ?? "pending"]++;
    const now = Date.now();
    const elapsedMs = this.run.startedAt ? (this.run.finishedAt ?? now) - this.run.startedAt : 0;
    const classified = this.msgs.filter((m) => m.originalCategory).length;
    const stats: StageStats = {
      lanes, lastSyncedAt: this.lastSyncedAt, classified, usd: classified * 600 * 0.042e-6,
      drain: { inTick: this.run.active, nextInMs: null, burst: 1000, run: { ...this.run, elapsedMs, perSec: elapsedMs > 500 ? this.run.classified / (elapsedMs / 1000) : 0, recent: [...this.run.recent] } },
      sync: { ...this.syncState },
    };
    return { items, stats };
  }

  async sync(older = false) {
    if (this.syncState.active) return { ok: false, error: "already running" };
    if (older && !this.msgs.some((m) => !m.fetched)) this.grow(this.total);
    const toFetch = this.msgs.filter((m) => !m.fetched).slice(0, this.total);
    this.syncState = { active: true, phase: "listing", done: 0, total: toFetch.length, startedAt: Date.now() };
    await new Promise((r) => setTimeout(r, 400));
    this.syncState.phase = "fetching";
    for (let i = 0; i < toFetch.length; i += 20) {
      await new Promise((r) => setTimeout(r, 120));
      for (const m of toFetch.slice(i, i + 20)) m.fetched = true;
      this.syncState.done = Math.min(toFetch.length, i + 20);
    }
    this.syncState.active = false;
    this.syncState.phase = "idle";
    this.lastSyncedAt = Date.now();
    this.startRun();
    return { ok: true, fetched: toFetch.length };
  }

  private startRun() {
    const pending = this.msgs.filter((m) => m.fetched && !m.category);
    if (!pending.length) return;
    this.run = { active: true, startedAt: Date.now(), finishedAt: null, total: pending.length, classified: 0, usd: 0, rateLimited: false, error: null, elapsedMs: 0, perSec: 0, recent: [] };
    let i = 0;
    this.timer = setInterval(() => {
      const m = pending[i++];
      if (!m) { clearInterval(this.timer!); this.run.active = false; this.run.finishedAt = Date.now(); return; }
      const conf = 0.82 + ((i * 37) % 18) / 100;
      m.category = m.truth; m.originalCategory = m.truth;
      m.categoryProbs = { [m.truth]: conf, updates: m.truth === "updates" ? conf : 1 - conf };
      m.urgency = m.truth === "needs_reply" ? 3 + (i % 3) : 1;
      m.isPersonal = m.truth === "needs_reply" ? 0.9 : 0.05;
      this.run.classified++;
      this.run.usd += 600 * 0.042e-6;
      const d: Decision = { id: m.id, from: m.fromName, subject: m.subject, category: m.truth, confidence: conf, at: Date.now() };
      this.run.recent = [d, ...this.run.recent].slice(0, 40);
    }, 1000 / this.rate);
  }

  async feedback(id: string, kind: FeedbackKind, value?: string) {
    const m = this.msgs.find((x) => x.id === id);
    if (!m) return;
    if (kind === "handled") m.handled = true;
    if (kind === "unhandled") m.handled = false;
    if (kind === "corrected_category" && value) { m.category = value as Category; m.corrected = value !== m.originalCategory; }
  }
}
