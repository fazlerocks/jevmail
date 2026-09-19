"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, RefreshCw, Inbox as InboxIcon, Tag, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MessageView } from "@/lib/queries";
import type { Category } from "@/db/schema";

/* Google Inbox-style feed: one chronological list, mail that needs you shown as
   cards, everything else collapsed into per-day bundles, one Done gesture. */

const BUNDLES: { key: Category; label: string; tone: string }[] = [
  { key: "updates", label: "Updates", tone: "bg-orange-500" },
  { key: "promotional", label: "Promos", tone: "bg-emerald-500" },
  { key: "sales", label: "Sales", tone: "bg-violet-500" },
  { key: "spam", label: "Spam", tone: "bg-zinc-400" },
];
const LABEL: Record<Category, string> = { needs_reply: "Needs reply", updates: "Updates", promotional: "Promos", sales: "Sales", spam: "Spam" };

type Stats = {
  lanes: Record<string, number>;
  lastSyncedAt: number | null;
  drain: { running: boolean; inTick: boolean; nextInMs: number | null; burst: number };
};

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ms: number) {
  const d = new Date(ms), n = new Date();
  const diff = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

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
    <Button
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-blue-50 hover:text-blue-600"
    >
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

function MessageCard({ m, open, onToggle, onDone, onMove, compact }: {
  m: MessageView; open: boolean; onToggle: () => void; onDone: () => void; onMove: (c: Category) => void; compact?: boolean;
}) {
  const urgent = (m.urgency ?? 0) >= 4;
  const body = (
    <Collapsible open={open} onOpenChange={onToggle} className="group">
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
        {!m.handled && <DoneButton onClick={onDone} />}
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
  return compact ? body : <Card className="gap-0 py-0">{body}</Card>;
}

function Bundle({ label, tone, items, open, onToggle, openId, setOpenId, onDone, onMove, onSweep }: {
  label: string; tone: string; items: MessageView[]; open: boolean; onToggle: () => void;
  openId: string | null; setOpenId: (id: string | null) => void;
  onDone: (m: MessageView) => void; onMove: (m: MessageView, c: Category) => void; onSweep: () => void;
}) {
  const senders = [...new Set(items.map((m) => m.fromName || m.fromEmail))].slice(0, 3).join(", ");
  return (
    <Card className="gap-0 py-0">
      <Collapsible open={open} onOpenChange={onToggle} className="group">
        <CollapsibleTrigger render={<div />} nativeButton={false} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
          <Avatar tone={tone}><InboxIcon className="size-4" /></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-medium">{label}</span>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="truncate text-[13px] text-muted-foreground">{senders}</div>
          </div>
          <DoneButton onClick={onSweep} title="Sweep: mark all done" />
          <ChevronDown className={cn("size-4 text-muted-foreground/60 transition", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="divide-y border-t">
          {items.map((m) => (
            <MessageCard key={m.id} m={m} compact open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} onDone={() => onDone(m)} onMove={(c) => onMove(m, c)} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ---------- main ---------- */

export default function Inbox() {
  const [items, setItems] = useState<MessageView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openBundles, setOpenBundles] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      fetch(`/api/messages?lane=all&includeHandled=${showDone}&limit=200`).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]);
    setItems(m.items ?? []);
    setStats(s);
    setLoaded(true);
  }, [showDone]);

  useEffect(() => {
    // Initial fetch and refetch when the Done filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`Sync failed: ${d.error ?? r.status}`);
      else setToast(d.fetched === 0 ? "Nothing new" : `${d.fetched} new${d.pending ? `, sorting ${d.pending} in the background` : ""}`);
      await load();
    } finally {
      setSyncing(false);
      setTimeout(() => setToast(null), 5000);
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

  const days = useMemo(() => {
    const map = new Map<string, MessageView[]>();
    for (const m of items.filter((m) => showDone || !m.handled)) map.set(dayKey(m.receivedAt), [...(map.get(dayKey(m.receivedAt)) ?? []), m]);
    return [...map.entries()].map(([key, list]) => ({
      key,
      label: dayLabel(list[0].receivedAt),
      cards: list.filter((m) => m.category === "needs_reply" || m.category === null),
      bundles: BUNDLES.map((b) => ({ ...b, items: list.filter((m) => m.category === b.key) })).filter((b) => b.items.length),
    }));
  }, [items, showDone]);

  const pending = stats?.lanes.pending ?? 0;
  const toggleBundle = (k: string) => setOpenBundles((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const status = pending > 0
    ? `Sorting ${pending}${stats?.drain.inTick ? "…" : stats?.drain.nextInMs != null ? ` · next ${stats.drain.burst} in ${Math.max(1, Math.round(stats.drain.nextInMs / 60000))} min` : ""}`
    : stats?.lastSyncedAt ? "All sorted" : "";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24">
      <div className="flex items-center justify-between py-2 text-[13px] text-muted-foreground">
        <span>{status}</span>
        <Button variant="ghost" size="sm" onClick={sync} disabled={syncing} className="text-blue-600">
          <RefreshCw className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing" : "Sync"}
        </Button>
      </div>

      {!loaded ? null : days.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-blue-50 text-blue-500"><Check className="size-6" /></div>
          <p className="text-[15px]">{stats?.lastSyncedAt ? "You're all done" : "Nothing here yet"}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{stats?.lastSyncedAt ? "Everything is handled." : "Sync pulls your 20 newest inbox messages."}</p>
          {!stats?.lastSyncedAt && (
            <Button onClick={sync} disabled={syncing} className="mt-5 rounded-full bg-blue-600 text-white hover:bg-blue-700">
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{d.label}</h2>
              <div className="space-y-2">
                {d.cards.map((m) => (
                  <MessageCard key={m.id} m={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} onDone={() => done(m)} onMove={(c) => move(m, c)} />
                ))}
                {d.bundles.map((b) => (
                  <Bundle key={b.key} label={b.label} tone={b.tone} items={b.items}
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

      {toast && <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-[13px] text-background shadow-lg">{toast}</div>}
    </div>
  );
}
