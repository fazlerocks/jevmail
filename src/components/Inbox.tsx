"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessageView, Lane } from "@/lib/queries";
import type { Category } from "@/db/schema";

const LANES: { key: Lane; label: string }[] = [
  { key: "needs_reply", label: "Needs reply" },
  { key: "updates", label: "Updates" },
  { key: "promotional", label: "Promotional" },
  { key: "sales", label: "Sales" },
  { key: "spam", label: "Spam" },
  { key: "pending", label: "Pending" },
];
const CATEGORY_LABEL: Record<Category, string> = {
  needs_reply: "Needs reply",
  updates: "Updates",
  promotional: "Promotional",
  sales: "Sales",
  spam: "Spam",
};

type Stats = {
  lanes: Record<string, number>;
  classified: number;
  corrected: number;
  agreement: number;
  lastSyncedAt: number | null;
  drain: {
    running: boolean;
    inTick: boolean;
    nextTickAt: number | null;
    nextInMs: number | null;
    lastResult: { classified: number; rateLimited: boolean; error: string | null } | null;
    burst: number;
    intervalMs: number;
  };
};

function timeAgo(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function UrgencyPill({ n }: { n: number | null }) {
  if (n === null) return null;
  const tone =
    n >= 5 ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
    : n >= 4 ? "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200"
    : n >= 3 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>U{n}</span>;
}

export default function Inbox() {
  const [lane, setLane] = useState<Lane>("needs_reply");
  const [showHandled, setShowHandled] = useState(false);
  const [items, setItems] = useState<MessageView[]>([]);
  const [selected, setSelected] = useState<MessageView | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      fetch(`/api/messages?lane=${lane}&includeHandled=${showHandled}&limit=200`).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]);
    setItems(m.items ?? []);
    setStats(s);
    setLoading(false);
  }, [lane, showHandled]);

  useEffect(() => {
    // Data fetch on mount and when lane/filter changes; state updates happen after the awaited fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`Sync failed: ${d.error ?? r.status}`);
      else if (d.error) setToast(`Fetched ${d.fetched}, classified ${d.classified}. Gateway: ${d.error}`);
      else
        setToast(
          `Fetched ${d.fetched}, classified ${d.classified} in ${(d.durationMs / 1000).toFixed(1)}s` +
            (d.pending ? `. ${d.pending} pending, classifying in the background.` : "") +
            (d.remaining ? ` ${d.remaining} more to pull, click Sync again.` : ""),
        );
      await load();
    } catch (e) {
      setToast(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setToast(null), 6000);
    }
  }, [syncing, load]);

  // Keep stats fresh while the background drainer works through Pending.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/stats").then((r) => r.json()).then(setStats);
      if (lane === "pending" || lane === "needs_reply") load();
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [lane, load]);

  // Optional auto-sync every 5 minutes while the tab is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [sync]);

  async function feedback(m: MessageView, kind: "corrected_category" | "handled" | "unhandled", value?: string) {
    const r = await fetch(`/api/messages/${m.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, value }),
    });
    const d = await r.json();
    if (d.message) {
      const updated: MessageView = d.message;
      setSelected((s) => (s?.id === m.id ? updated : s));
      setItems((list) => {
        const stillVisible =
          (showHandled || !updated.handled) &&
          (lane === "all" || (lane === "pending" ? updated.category === null : updated.category === lane));
        return stillVisible ? list.map((x) => (x.id === m.id ? updated : x)) : list.filter((x) => x.id !== m.id);
      });
      fetch("/api/stats").then((r) => r.json()).then(setStats);
    }
  }

  const total = stats ? Object.values(stats.lanes).reduce((a, b) => a + b, 0) : 0;
  const neverSynced = stats && stats.lastSyncedAt === null;

  return (
    <div className="space-y-4">
      {/* Sync bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-zinc-500">
          {stats?.lastSyncedAt ? `Last synced ${timeAgo(stats.lastSyncedAt)}` : "Not synced yet"}
          {stats && stats.lanes.pending > 0 && stats.drain.running && (
            <span className="ml-2">
              · {stats.drain.inTick ? "Classifying…" : `Next ${stats.drain.burst} in ${Math.max(1, Math.round((stats.drain.nextInMs ?? 0) / 60000))} min`}
              {stats.drain.lastResult?.rateLimited && " (free tier limit)"}
            </span>
          )}
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          {LANES.map((l) => (
            <button
              key={l.key}
              onClick={() => setLane(l.key)}
              className={`rounded-lg border px-3 py-2 text-left ${
                lane === l.key
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wide opacity-70">{l.label}</div>
              <div className="text-xl font-semibold">{stats.lanes[l.key] ?? 0}</div>
            </button>
          ))}
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[11px] uppercase tracking-wide opacity-70">Jev agreement</div>
            <div className="text-xl font-semibold">{Math.round(stats.agreement * 100)}%</div>
          </div>
        </div>
      )}

      {/* Tabs row */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-1 overflow-x-auto">
          {LANES.map((l) => (
            <button
              key={l.key}
              onClick={() => setLane(l.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                lane === l.key ? "border-zinc-900 font-medium dark:border-white" : "border-transparent text-zinc-500"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          Show handled
        </label>
      </div>

      {/* Body */}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {neverSynced && total === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-500">Nothing pulled yet. Sync reads your 20 newest inbox messages.</p>
              <button onClick={sync} disabled={syncing} className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-zinc-900">
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">Nothing in this lane.</div>
          ) : (
            items.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                  selected?.id === m.id ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {m.lowConfidence && <span title="Low confidence" className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    <span className="truncate text-sm font-medium">{m.fromName || m.fromEmail}</span>
                    {m.corrected && <span className="text-[10px] text-zinc-400">corrected</span>}
                    {m.handled && <span className="text-[10px] text-zinc-400">handled</span>}
                  </div>
                  <div className="truncate text-sm">{m.subject || "(no subject)"}</div>
                  <div className="truncate text-xs text-zinc-500">{m.snippet.slice(0, 100)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-zinc-400">{timeAgo(m.receivedAt)}</span>
                  <UrgencyPill n={m.urgency} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-20 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:max-h-none lg:rounded-lg lg:shadow-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{selected.fromName}</div>
                <div className="truncate text-xs text-zinc-500">{selected.fromEmail}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-white">✕</button>
            </div>
            <h2 className="mt-2 text-base font-semibold">{selected.subject || "(no subject)"}</h2>
            <div className="mt-1 text-xs text-zinc-500">{new Date(selected.receivedAt).toLocaleString()}</div>

            {selected.categoryProbs && (
              <div className="mt-4 space-y-1.5">
                {Object.entries(selected.categoryProbs)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, p]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 text-zinc-500">{CATEGORY_LABEL[k as Category] ?? k}</span>
                      <div className="h-1.5 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-1.5 rounded bg-zinc-900 dark:bg-white" style={{ width: `${Math.round(p * 100)}%` }} />
                      </div>
                      <span className="w-9 text-right font-mono">{Math.round(p * 100)}%</span>
                    </div>
                  ))}
                <div className="flex gap-4 pt-1 text-xs text-zinc-500">
                  <span>Urgency <b className="text-zinc-900 dark:text-white">{selected.urgency}</b>/5</span>
                  <span>Personal <b className="text-zinc-900 dark:text-white">{Math.round((selected.isPersonal ?? 0) * 100)}%</b></span>
                  {selected.isReplyToMe && <span>You replied before</span>}
                </div>
              </div>
            )}

            <pre className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-sans text-sm dark:bg-zinc-950">
              {selected.snippet || "(empty body)"}
            </pre>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={selected.gmailUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-zinc-900"
              >
                Open in Gmail
              </a>
              <button
                onClick={() => feedback(selected, selected.handled ? "unhandled" : "handled")}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                {selected.handled ? "Unmark handled" : "Mark handled"}
              </button>
              <select
                value=""
                onChange={(e) => e.target.value && feedback(selected, "corrected_category", e.target.value)}
                className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
              >
                <option value="">Wrong lane…</option>
                {(Object.keys(CATEGORY_LABEL) as Category[])
                  .filter((c) => c !== selected.category)
                  .map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}
