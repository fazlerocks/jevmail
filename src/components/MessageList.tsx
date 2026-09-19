"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, ExternalLink, FolderInput, Undo2 } from "lucide-react";
import Key from "@/components/Key";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MessageView } from "@/lib/queries";
import type { Category } from "@/db/schema";

export const LABEL: Record<Category, string> = {
  needs_reply: "Needs reply",
  updates: "Updates",
  promotional: "Promos",
  sales: "Sales",
  spam: "Spam",
};

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ms: number) {
  const d = new Date(ms), n = new Date();
  const diff = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function when(ms: number) {
  const d = new Date(ms), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const READ_KEY = "jevmail:read";
function loadRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")); } catch { return new Set(); }
}
function saveRead(s: Set<string>) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...s].slice(-2000))); } catch {}
}

const textBtn = "text-[12px] tracking-[0.02em] text-ash hover:text-ink transition-colors";

function Row({ m, active, unread, onOpen, onDone }: {
  m: MessageView; active: boolean; unread: boolean; onOpen: () => void; onDone: () => void;
}) {
  const urgent = (m.urgency ?? 0) >= 4;
  return (
    <li
      data-row={m.id}
      onClick={onOpen}
      className={cn("group relative flex cursor-pointer items-baseline gap-3 py-3 pl-7 pr-4 transition-colors", active ? "bg-shu/8" : "hover:bg-paper")}
    >
      <span className={cn("absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full", unread ? "bg-shu" : "bg-transparent")} />
      <span className={cn("w-32 shrink-0 truncate text-[13.5px]", unread ? "font-semibold text-ink" : "text-ink")}>{m.fromName || m.fromEmail}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        {urgent && <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-persimmon align-middle" title="Urgent" />}
        <span className={cn(unread ? "font-medium text-ink" : "text-ink")}>{m.subject || "(no subject)"}</span>
        <span className="text-ash"> · {m.snippet.slice(0, 120)}</span>
      </span>
      <span className="shrink-0 text-[12px] tabular-nums text-ash group-hover:hidden">{when(m.receivedAt)}</span>
      <button onClick={(e) => { e.stopPropagation(); onDone(); }} className={cn(textBtn, "hidden shrink-0 group-hover:inline")}>{m.handled ? "Undo" : "Done"}</button>
    </li>
  );
}

const cta = "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-opacity hover:opacity-90 [&_svg]:size-3.5";

function Reading({ m, onDone, onMove }: { m: MessageView; onDone: () => void; onMove: (c: Category) => void }) {
  const initial = (m.fromName || m.fromEmail).trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className="flex h-full flex-col">
      <h2 className="text-[18px] font-semibold leading-snug text-ink">{m.subject || "(no subject)"}</h2>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hair text-[14px] font-medium text-ink">{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{m.fromName || m.fromEmail}</div>
          <div className="truncate text-[12px] text-ash">{m.fromEmail}</div>
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-ash">{new Date(m.receivedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-hair pb-5">
        <a href={m.gmailUrl} target="_blank" rel="noreferrer" className={cn(cta, "bg-shu")}>
          <ExternalLink /> Open in Gmail <Key className="border-white/30 bg-white/15 text-white/90 shadow-none">o</Key>
        </a>
        <button onClick={onDone} className={cn(cta, m.handled ? "bg-stone" : "bg-matcha")}>
          {m.handled ? <Undo2 /> : <Check />} {m.handled ? "Undo done" : "Done"} <Key className="border-white/30 bg-white/15 text-white/90 shadow-none">e</Key>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(cta, "bg-white text-ink")}>
            <FolderInput className="text-ash" /> {m.category ? LABEL[m.category] : "Sorting…"} <ChevronDown className="size-3 text-ash" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(LABEL) as Category[]).filter((c) => c !== m.category).map((c) => (
              <DropdownMenuItem key={c} onClick={() => onMove(c)}>Move to {LABEL[c]}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {m.categoryProbs && (
          <span className="ml-auto text-[11px] text-ash">
            Jev · {Object.entries(m.categoryProbs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, p]) => `${LABEL[k as Category]} ${Math.round(p * 100)}%`).join(" · ")}
            {m.corrected && " · corrected"}
          </span>
        )}
      </div>
      <p className="mt-5 max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-ink/85">{m.snippet || "(empty)"}</p>
    </div>
  );
}

export default function MessageList({ items, query, selectedId, onSelect, onDone, onMove, emptyText }: {
  items: MessageView[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDone: (m: MessageView) => void;
  onMove: (m: MessageView, c: Category) => void;
  emptyText: string;
}) {
  const [read, setRead] = useState<Set<string>>(new Set());
  // read state lives in this browser only; restored after mount
  useEffect(() => { const t = setTimeout(() => setRead(loadRead()), 0); return () => clearTimeout(t); }, []);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((m) => `${m.fromName} ${m.fromEmail} ${m.subject}`.toLowerCase().includes(q)) : items;
    return [...filtered].sort((a, b) => (b.urgency ?? 0) >= 4 !== (a.urgency ?? 0) >= 4 ? ((b.urgency ?? 0) >= 4 ? 1 : -1) : b.receivedAt - a.receivedAt);
  }, [items, query]);

  const selected = visible.find((m) => m.id === selectedId) ?? null;

  const open = (id: string | null) => {
    onSelect(id);
    if (id) setRead((r) => { const n = new Set(r); n.add(id); saveRead(n); return n; });
  };

  // keyboard: j/k move, enter open, e done, o open in Gmail, esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = visible.findIndex((m) => m.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); const n = visible[Math.min(visible.length - 1, idx + 1)]; if (n) open(n.id); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); const n = visible[Math.max(0, idx - 1)]; if (n) open(n.id); }
      else if (e.key === "Escape") { onSelect(null); }
      else if (e.key === "e" && selected) { e.preventDefault(); onDone(selected); }
      else if (e.key === "o" && selected) { e.preventDefault(); window.open(selected.gmailUrl, "_blank", "noreferrer"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedId, selected]);

  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const days = useMemo(() => {
    const map = new Map<string, MessageView[]>();
    for (const m of visible) { const k = dayKey(m.receivedAt); map.set(k, [...(map.get(k) ?? []), m]); }
    return [...map.values()];
  }, [visible]);

  const panel = "min-h-0 min-w-0 rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.03)]";

  if (visible.length === 0) {
    return (
      <div className={cn(panel, "flex flex-1 flex-col items-center justify-center text-center")}>
        <p className="text-[13px] text-ash">{query ? "No matches." : emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ScrollArea ref={listRef} className={cn(panel, "h-full")}>
        {days.map((list) => (
          <section key={dayKey(list[0].receivedAt)}>
            <h3 className="sticky top-0 z-10 border-b border-hair bg-white/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ash backdrop-blur">{dayLabel(list[0].receivedAt)}</h3>
            <ul className="divide-y divide-hair">
              {list.map((m) => (
                <Row key={m.id} m={m} active={m.id === selectedId} unread={!read.has(m.id)} onOpen={() => open(m.id === selectedId ? null : m.id)} onDone={() => onDone(m)} />
              ))}
            </ul>
          </section>
        ))}
      </ScrollArea>
      <ScrollArea className={cn(panel, "h-full", !selected && "max-lg:hidden")}>
        <div className="min-h-full p-6">
          {selected ? (
            <Reading m={selected} onDone={() => onDone(selected)} onMove={(c) => onMove(selected, c)} />
          ) : (
            <div className="hidden h-full flex-col items-center justify-center gap-2 text-center lg:flex">
              <span className="text-[13px] text-ash">No message selected</span>
              <span className="flex items-center gap-1.5 text-[11px] text-ash/70"><Key>j</Key><Key>k</Key> to move</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
