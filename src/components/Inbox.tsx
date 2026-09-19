"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RefreshCw, Inbox as InboxIcon, Tag, ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MessageView } from "@/lib/queries";
import type { Category } from "@/db/schema";

/* Google Inbox-style feed: one chronological list, mail that needs you shown as
   cards, everything else collapsed into per-day bundles, one Done gesture.
   While Jev is sorting, the Sorting bundle drains live and the chips count up. */

const BUNDLES: { key: Category; label: string; tone: string }[] = [
  { key: "updates", label: "Updates", tone: "bg-orange-500" },
  { key: "promotional", label: "Promos", tone: "bg-emerald-500" },
  { key: "sales", label: "Sales", tone: "bg-violet-500" },
  { key: "spam", label: "Spam", tone: "bg-zinc-400" },
];
const LABEL: Record<Category, string> = { needs_reply: "Needs reply", updates: "Updates", promotional: "Promos", sales: "Sales", spam: "Spam" };
const CHIPS: { key: "all" | Category; label: string; tone: string }[] = [
  { key: "all", label: "All", tone: "" },
  { key: "needs_reply", label: "Needs reply", tone: "bg-blue-500" },
  ...BUNDLES,
];
const SORTING_PREVIEW = 8;
const EXIT_MS = 320;

type Stats = {
  lanes: Record<string, number>;
  lastSyncedAt: number | null;
  drain: {
    inTick: boolean;
    nextInMs: number | null;
    burst: number;
    concurrency: number;
    run: {
      active: boolean; startedAt: number | null; finishedAt: number | null; total: number; classified: number;
      inputTokens: number; usd: number; rateLimited: boolean; error: string | null; elapsedMs: number; perSec: number;
      recent: { id: string; from: string; subject: string; category: Category; confidence: number; at: number }[];
    };
  };
  sync: { active: boolean; phase: "idle" | "listing" | "fetching"; done: number; total: number; startedAt: number | null };
};

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ms: number) {
  const d = new Date(ms), n = new Date();
  const diff = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/* ---------- pieces ---------- */

function Avatar({ name, tone, children }: { name?: string; tone?: string; children?: React.ReactNode }) {
  const letter = (name?.trim()[0] ?? "?").toUpperCase();
  const palette = ["bg-blue-500", "bg-rose-500", "bg-amber-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500"];
  return (
    <div className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium text-white", tone ?? palette[letter.charCodeAt(0) % palette.length])}>
      {children ?? letter}
    </div>
  );
}

function DoneButton({ onClick, title = "Done" }: { onClick: () => void; title?: string }) {
  return (
    <Button variant="ghost" size="icon" title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-blue-50 hover:text-blue-600">
      <Check />
    </Button>
  );
}

function MoveMenu({ current, onMove }: { current: Category | null; onMove: (c: Category) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
        <Tag /> {current ? LABEL[current] : "Sorting…"} <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(LABEL) as Category[]).filter((c) => c !== current).map((c) => (
          <DropdownMenuItem key={c} onClick={() => onMove(c)}>Move to {LABEL[c]}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MessageCard({ m, open, onToggle, onDone, onMove, compact, exiting, entering }: {
  m: MessageView; open: boolean; onToggle: () => void; onDone: () => void; onMove: (c: Category) => void;
  compact?: boolean; exiting?: boolean; entering?: boolean;
}) {
  const urgent = (m.urgency ?? 0) >= 4;
  const anim = exiting ? "animate-out fade-out slide-out-to-left-4 duration-300 fill-mode-forwards" : entering ? "animate-in fade-in slide-in-from-top-2 duration-300" : "";
  const body = (
    <Collapsible open={open} onOpenChange={onToggle} className={cn("group", anim)}>
      <CollapsibleTrigger render={<div />} nativeButton={false} className={cn("flex w-full cursor-pointer items-start gap-3 text-left", compact ? "px-3 py-2.5" : "px-4 py-3.5")}>
        {!compact && <Avatar name={m.fromName || m.fromEmail} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-medium">{m.fromName || m.fromEmail}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{clock(m.receivedAt)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {urgent && <Badge variant="destructive">Urgent</Badge>}
            <span className="truncate text-[14px]">{m.subject || "(no subject)"}</span>
          </div>
          {!open && <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{m.snippet}</div>}
        </div>
        {!m.handled && !exiting && <DoneButton onClick={onDone} />}
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(compact ? "px-3 pb-3" : "px-4 pb-4 pl-[68px]")}>
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/80">{m.snippet || "(empty)"}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" render={<a href={m.gmailUrl} target="_blank" rel="noreferrer" />} nativeButton={false} className="text-blue-600">
            Open in Gmail <ArrowUpRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDone}><Check /> {m.handled ? "Move to inbox" : "Done"}</Button>
          <div className="ml-auto"><MoveMenu current={m.category} onMove={onMove} /></div>
        </div>
        {m.categoryProbs && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            Jev: {Object.entries(m.categoryProbs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, p]) => `${LABEL[k as Category]} ${Math.round(p * 100)}%`).join(" · ")}
            {m.corrected && " · corrected by you"}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
  return compact ? body : <Card className={cn("gap-0 py-0", entering && "ring-blue-300")}>{body}</Card>;
}

function Bundle({ label, tone, items, open, onToggle, openId, setOpenId, onDone, onMove, onSweep, icon, hint, exitingIds, hiddenCount, pulse }: {
  label: string; tone: string; items: MessageView[]; open: boolean; onToggle: () => void;
  openId: string | null; setOpenId: (id: string | null) => void;
  onDone: (m: MessageView) => void; onMove: (m: MessageView, c: Category) => void; onSweep?: () => void;
  icon?: React.ReactNode; hint?: React.ReactNode; exitingIds?: Set<string>; hiddenCount?: number; pulse?: number;
}) {
  const senders = [...new Set(items.map((m) => m.fromName || m.fromEmail))].slice(0, 3).join(", ");
  const count = items.length + (hiddenCount ?? 0);
  return (
    <Card className="gap-0 py-0">
      <Collapsible open={open} onOpenChange={onToggle} className="group">
        <CollapsibleTrigger render={<div />} nativeButton={false} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
          <Avatar tone={tone}>{icon ?? <InboxIcon className="size-4" />}</Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-medium">{label}</span>
              <Badge key={pulse ?? count} variant="secondary" className={pulse !== undefined ? "animate-in zoom-in-50 duration-300" : ""}>{count}</Badge>
              {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
            </div>
            <div className="truncate text-[13px] text-muted-foreground">{senders}</div>
          </div>
          {onSweep && <DoneButton onClick={onSweep} title="Sweep: mark all done" />}
          <ChevronDown className={cn("size-4 text-muted-foreground/60 transition", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="divide-y border-t">
          {items.map((m) => (
            <MessageCard key={m.id} m={m} compact open={openId === m.id} exiting={exitingIds?.has(m.id)}
              onToggle={() => setOpenId(openId === m.id ? null : m.id)} onDone={() => onDone(m)} onMove={(c) => onMove(m, c)} />
          ))}
          {hiddenCount ? <div className="px-3 py-2 text-center text-xs text-muted-foreground">and {hiddenCount} more</div> : null}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ---------- main ---------- */

export default function Inbox({ email, signOut }: { email: string; signOut: React.ReactNode }) {
  const [items, setItems] = useState<MessageView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openBundles, setOpenBundles] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // live-sorting animation state
  const [exiting, setExiting] = useState<Map<string, MessageView>>(new Map());
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const prevItems = useRef<MessageView[]>([]);
  const prevRunActive = useRef(false);
  const prevCounts = useRef<Record<string, number>>({});
  const [pulses, setPulses] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      fetch(`/api/messages?lane=all&includeHandled=${showDone}&limit=1200`).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]);
    const next: MessageView[] = m.items ?? [];

    // Which messages just left Pending? Keep them rendered briefly with an exit animation.
    const wasPending = new Map(prevItems.current.filter((x) => x.category === null).map((x) => [x.id, x]));
    const nowPending = new Set(next.filter((x) => x.category === null).map((x) => x.id));
    const left = [...wasPending.values()].filter((x) => !nowPending.has(x.id));
    if (left.length) {
      setExiting((e) => { const n = new Map(e); for (const x of left) n.set(x.id, x); return n; });
      setEntered((e) => new Set([...e, ...left.map((x) => x.id)]));
      setTimeout(() => {
        setExiting((e) => { const n = new Map(e); for (const x of left) n.delete(x.id); return n; });
      }, EXIT_MS);
      setTimeout(() => setEntered((e) => { const n = new Set(e); for (const x of left) n.delete(x.id); return n; }), 1200);
    }
    // Pulse chips and bundles whose counts rose.
    const counts: Record<string, number> = s?.lanes ?? {};
    const rose = Object.keys(counts).filter((k) => (counts[k] ?? 0) > (prevCounts.current[k] ?? 0));
    if (rose.length && Object.keys(prevCounts.current).length) setPulses((p) => { const n = { ...p }; for (const k of rose) n[k] = (n[k] ?? 0) + 1; return n; });
    prevCounts.current = counts;

    // Finish toast when a run ends.
    if (prevRunActive.current && !s?.drain?.run?.active && s?.drain?.run?.classified > 0 && !s.drain.run.rateLimited) {
      const r = s.drain.run;
      setToast(`Sorted ${r.classified.toLocaleString()} emails in ${(r.elapsedMs / 1000).toFixed(1)}s for ${usd(r.usd)}`);
      setTimeout(() => setToast(null), 8000);
    }
    prevRunActive.current = Boolean(s?.drain?.run?.active);

    prevItems.current = next;
    setItems(next);
    setStats(s);
    setLoaded(true);
  }, [showDone]);

  useEffect(() => {
    // Initial fetch and refetch when the Done filter changes.
    load();
  }, [load]);

  // Poll fast while something is happening, slowly otherwise.
  const live = Boolean(stats?.sync.active || stats?.drain.inTick || (stats?.drain.run.active && !stats.drain.run.rateLimited));
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, live ? 300 : 30_000);
    return () => clearInterval(id);
  }, [load, live]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    // start polling immediately so the fetch progress shows
    const poll = setInterval(load, 400);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`Sync failed: ${d.error ?? r.status}`);
      else if (d.fetched === 0) setToast("Nothing new");
      await load();
    } finally {
      clearInterval(poll);
      setSyncing(false);
      setTimeout(() => setToast((t) => (t?.startsWith("Sorted") ? t : null)), 4000);
    }
  }, [syncing, load]);

  async function feedback(m: MessageView, kind: "corrected_category" | "handled" | "unhandled", value?: string) {
    setItems((list) => list.map((x) => x.id === m.id
      ? { ...x, handled: kind === "handled" ? true : kind === "unhandled" ? false : x.handled, category: kind === "corrected_category" ? (value as Category) : x.category }
      : x));
    await fetch(`/api/messages/${m.id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value }) });
    load();
  }
  const done = (m: MessageView) => feedback(m, m.handled ? "unhandled" : "handled");
  const move = (m: MessageView, c: Category) => { if (c !== m.category) feedback(m, "corrected_category", c); };
  const sweep = (ms: MessageView[]) => Promise.all(ms.filter((m) => !m.handled).map((m) => feedback(m, "handled")));

  const run = stats?.drain.run;
  const runActive = Boolean(run?.active);
  const syncActive = Boolean(stats?.sync.active);

  const days = useMemo(() => {
    const map = new Map<string, MessageView[]>();
    const visible = items.filter((m) => (showDone || !m.handled) && (filter === "all" || m.category === filter));
    for (const m of visible) map.set(dayKey(m.receivedAt), [...(map.get(dayKey(m.receivedAt)) ?? []), m]);
    // exiting cards stay in their day's Sorting bundle until the animation ends
    for (const x of exiting.values()) { const k = dayKey(x.receivedAt); if (filter === "all" && !map.get(k)?.some((m) => m.id === x.id)) map.set(k, [x, ...(map.get(k) ?? [])]); }
    return [...map.entries()].sort((a, b) => b[1][0].receivedAt - a[1][0].receivedAt).map(([key, list]) => {
      const pending = filter === "all" ? list.filter((m) => m.category === null || exiting.has(m.id)) : [];
      return {
        key,
        label: dayLabel(list[0].receivedAt),
        cards: filter === "all" ? list.filter((m) => m.category === "needs_reply" && !exiting.has(m.id)) : list,
        pending: pending.slice(0, SORTING_PREVIEW),
        pendingHidden: Math.max(0, pending.length - SORTING_PREVIEW),
        bundles: filter === "all" ? BUNDLES.map((b) => ({ ...b, items: list.filter((m) => m.category === b.key && !exiting.has(m.id)) })).filter((b) => b.items.length) : [],
      };
    });
  }, [items, showDone, filter, exiting]);

  const pending = stats?.lanes.pending ?? 0;
  const toggleBundle = (k: string) => setOpenBundles((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // status line + progress
  let status: React.ReactNode = "";
  let progress: number | null = null;
  if (syncActive && stats) {
    status = stats.sync.phase === "listing" ? "Listing inbox…" : `Fetching ${stats.sync.done.toLocaleString()} / ${stats.sync.total.toLocaleString()}`;
    progress = stats.sync.total ? stats.sync.done / stats.sync.total : 0.02;
  } else if (run && (runActive || run.rateLimited) && pending > 0) {
    const rate = run.perSec;
    status = run.rateLimited
      ? `${pending} still sorting · free tier: next ${stats!.drain.burst} in ${Math.max(1, Math.round((stats!.drain.nextInMs ?? 0) / 60000))} min`
      : <>Sorting <b className="text-foreground tabular-nums">{run.classified.toLocaleString()} / {run.total.toLocaleString()}</b>{rate > 0 && <> · {rate.toFixed(0)}/s · {usd(run.usd)}</>}</>;
    progress = run.total ? run.classified / run.total : 0;
  } else if (pending > 0) {
    status = `${pending} still sorting`;
  } else if (stats?.lastSyncedAt) {
    status = "All sorted";
  }
  const lastDecision = run?.recent[0];

  return (
    <>
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-semibold tracking-tight" title={email}>Jevmail</span>
          {signOut}
        </div>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          {CHIPS.map((c) => {
            const count = c.key === "all" ? Object.values(stats?.lanes ?? {}).reduce((a, n) => a + n, 0) : stats?.lanes[c.key] ?? 0;
            const active = filter === c.key;
            const pulse = pulses[c.key];
            return (
              <Button key={c.key} variant={active ? "default" : "outline"} size="sm" onClick={() => setFilter(c.key)} className={cn("shrink-0 rounded-full", !active && "bg-background")}>
                {c.tone && <span key={pulse} className={cn("size-2 rounded-full", c.tone, pulse !== undefined && "animate-in zoom-in-0 duration-500")} />}
                {c.label}
                {count > 0 && <span key={`n${count}`} className={cn("text-xs tabular-nums", active ? "opacity-70" : "text-muted-foreground", pulse !== undefined && "animate-in fade-in duration-300")}>{count.toLocaleString()}</span>}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="h-0.5 w-full bg-transparent">
        {progress !== null && <div className="h-0.5 bg-blue-500 transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />}
      </div>
    </header>
    <div className="mx-auto w-full max-w-2xl px-4 pb-24">
      <div className="flex items-center justify-between py-2 text-[13px] text-muted-foreground">
        <span>{status}</span>
        <Button variant="ghost" size="sm" onClick={sync} disabled={syncing || syncActive} className="text-blue-600">
          <RefreshCw className={cn((syncing || syncActive) && "animate-spin")} /> {syncing || syncActive ? "Syncing" : "Sync"}
        </Button>
      </div>

      {!loaded ? null : days.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-blue-50 text-blue-500"><Check className="size-6" /></div>
          <p className="text-[15px]">{filter !== "all" ? `Nothing in ${LABEL[filter]}` : stats?.lastSyncedAt ? "You're all done" : "Nothing here yet"}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{filter !== "all" ? "" : stats?.lastSyncedAt ? "Everything is handled." : "Sync pulls your newest inbox messages."}</p>
          {!stats?.lastSyncedAt && filter === "all" && (
            <Button onClick={sync} disabled={syncing} className="mt-5 rounded-full bg-blue-600 text-white hover:bg-blue-700">{syncing ? "Syncing…" : "Sync now"}</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{d.label}</h2>
              <div className="space-y-2">
                {d.cards.map((m) => (
                  <MessageCard key={m.id} m={m} open={openId === m.id} entering={entered.has(m.id)}
                    onToggle={() => setOpenId(openId === m.id ? null : m.id)} onDone={() => done(m)} onMove={(c) => move(m, c)} />
                ))}
                {d.pending.length > 0 && (
                  <Bundle label="Sorting" tone="bg-zinc-300" items={d.pending} hiddenCount={d.pendingHidden} exitingIds={new Set(exiting.keys())}
                    icon={<Loader2 className={cn("size-4 text-zinc-600", (runActive || syncActive) && "animate-spin")} />}
                    hint={runActive && lastDecision
                      ? <span key={lastDecision.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">{lastDecision.from} → {LABEL[lastDecision.category]} {Math.round(lastDecision.confidence * 100)}%</span>
                      : run?.rateLimited && stats?.drain.nextInMs != null ? `next ${stats.drain.burst} in ${Math.max(1, Math.round(stats.drain.nextInMs / 60000))} min` : undefined}
                    open={runActive || openBundles.has(`${d.key}:pending`)} onToggle={() => toggleBundle(`${d.key}:pending`)}
                    openId={openId} setOpenId={setOpenId} onDone={done} onMove={move} />
                )}
                {d.bundles.map((b) => (
                  <Bundle key={b.key} label={b.label} tone={b.tone} items={b.items} pulse={pulses[b.key]}
                    open={openBundles.has(`${d.key}:${b.key}`)} onToggle={() => toggleBundle(`${d.key}:${b.key}`)}
                    openId={openId} setOpenId={setOpenId} onDone={done} onMove={move} onSweep={() => sweep(b.items)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {loaded && (
        <div className="mt-10 text-center">
          <Button variant="link" size="sm" onClick={() => setShowDone((v) => !v)} className="text-muted-foreground">{showDone ? "Hide done" : "Show done"}</Button>
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 rounded-full bg-foreground px-4 py-2 text-[13px] text-background shadow-lg">{toast}</div>}
    </div>
    </>
  );
}
