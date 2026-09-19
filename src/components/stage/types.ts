import type { MessageView } from "@/lib/queries";
import type { Category, FeedbackKind } from "@/db/schema";

export type Decision = { id: string; from: string; subject: string; category: Category; confidence: number; at: number };

export type StageStats = {
  lanes: Record<string, number>;
  lastSyncedAt: number | null;
  /** lifetime totals for the footer */
  classified: number;
  usd: number;
  drain: {
    inTick: boolean;
    nextInMs: number | null;
    burst: number;
    run: {
      active: boolean; startedAt: number | null; finishedAt: number | null; total: number; classified: number;
      usd: number; rateLimited: boolean; error: string | null; elapsedMs: number; perSec: number; recent: Decision[];
    };
  };
  sync: { active: boolean; phase: "idle" | "listing" | "fetching"; done: number; total: number };
};

/** Everything the stage needs from the outside world. The app passes fetch calls; the preview passes a simulator. */
export type StageApi = {
  load: (showDone: boolean) => Promise<{ items: MessageView[]; stats: StageStats }>;
  sync: () => Promise<{ ok: boolean; error?: string; fetched?: number }>;
  feedback: (id: string, kind: FeedbackKind, value?: string) => Promise<void>;
};

export const apiClient: StageApi = {
  async load(showDone) {
    const [m, s] = await Promise.all([
      fetch(`/api/messages?lane=all&includeHandled=${showDone}&limit=1200`).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]);
    return { items: m.items ?? [], stats: s };
  },
  async sync() {
    const r = await fetch("/api/sync", { method: "POST" });
    const d = await r.json();
    return r.ok ? { ok: true, fetched: d.fetched } : { ok: false, error: d.error ?? String(r.status) };
  },
  async feedback(id, kind, value) {
    await fetch(`/api/messages/${id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value }) });
  },
};

export const CATEGORY_ORDER: Category[] = ["needs_reply", "updates", "promotional", "sales", "spam"];
export const TONE: Record<Category, string> = {
  needs_reply: "var(--shu)",
  updates: "var(--persimmon)",
  promotional: "var(--matcha)",
  sales: "var(--wisteria)",
  spam: "var(--stone)",
};
