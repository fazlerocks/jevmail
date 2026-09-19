"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { MessageView } from "@/lib/queries";
import type { Category, FeedbackKind } from "@/db/schema";
import { apiClient, CATEGORY_ORDER, TONE, type StageApi, type StageStats, type Decision } from "./stage/types";
import Preview, { type Point } from "./stage/Preview";
import ProgressBar, { LANE_H, type BarMode } from "./stage/ProgressBar";
import Column from "./stage/Column";
import MessageList, { LABEL } from "./MessageList";
import { cn } from "@/lib/utils";

const MAX_FLIGHTS = 4;   // previews on the track are a sample; stacks and counts carry the full rate
const RELEASE_MS = 320;  // one preview leaves the source at most this often
const QUEUE_MAX = 12;
const SETTLE_MS = 1500;  // keep the stage open briefly after the last preview lands

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const ago = (ms: number) => { const s = (Date.now() - ms) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const store = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

type Flight = { key: number; id: string; name: string; subject: string; from: Point; gate?: Point; to: Point; trackY: number; category: Category; text: string };
type Toast = { text: string; undo?: () => void };

export default function Stage({ email, signOut, api = apiClient }: { email: string; signOut: React.ReactNode; api?: StageApi }) {
  const [items, setItems] = useState<MessageView[]>([]);
  const [stats, setStats] = useState<(StageStats & { receivedAt: number }) | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [selected, setSelected] = useState<Category>("needs_reply");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [trackReady, setTrackReady] = useState(false);

  // live sorting
  const [flights, setFlights] = useState<Flight[]>([]);
  const [decision, setDecision] = useState<{ text: string; category: Category; key: number } | null>(null);
  const [arriving, setArriving] = useState<Record<string, number>>({});
  const seen = useRef<Set<string>>(new Set());
  const queue = useRef<Decision[]>([]);
  const pumping = useRef(false);
  const flightKey = useRef(0);
  const flightCount = useRef(0);
  const inFlight = useRef(false);
  const prevRunActive = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const jevRef = useRef<HTMLDivElement>(null);
  const stackRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // remembered preferences, restored after mount so server and first client render agree
  useEffect(() => {
    const t = setTimeout(() => {
      const c = store.get("jevmail:selected", "needs_reply");
      if ((CATEGORY_ORDER as string[]).includes(c)) setSelected(c as Category);
      setShowDone(store.get("jevmail:showDone", "0") === "1");
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { store.set("jevmail:selected", selected); }, [selected]);
  useEffect(() => { store.set("jevmail:showDone", showDone ? "1" : "0"); }, [showDone]);

  const say = useCallback((t: Toast | null, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t) toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  /** Point on an element relative to the stage. "stackTop" = top of the paper stack inside it. */
  const point = (el: HTMLElement | null, where: "center" | "stackTop" = "center"): Point | null => {
    const st = stageRef.current;
    if (!el || !st) return null;
    const a = el.getBoundingClientRect(), b = st.getBoundingClientRect();
    if (where === "stackTop") {
      const fill = el.firstElementChild as HTMLElement | null;
      const h = fill ? parseFloat(fill.style.height || "0") : 0;
      return { x: a.left - b.left + a.width / 2, y: a.bottom - b.top - h - 2 };
    }
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  };

  const spawn = useCallback((d: Decision, fromCategory?: Category) => {
    const start = fromCategory ? point(stackRefs.current[fromCategory], "stackTop") : point(sourceRef.current);
    // previews enter from the left end of the bar, fully on screen
    const from = start && !fromCategory ? { x: start.x + 96, y: start.y } : start;
    const gate = fromCategory ? null : point(jevRef.current);
    const to = point(stackRefs.current[d.category], "stackTop");
    if (!from || !to || flightCount.current >= MAX_FLIGHTS) return false;
    flightCount.current++;
    const key = ++flightKey.current;
    const trackY = (gate?.y ?? from.y) - 3 - LANE_H / 2; // ride the lane just above the bar
    setFlights((f) => [...f, { key, id: d.id, name: d.from, subject: d.subject, from, gate: gate ?? undefined, to, trackY, category: d.category, text: `${LABEL[d.category]} · ${Math.round(d.confidence * 100)}%` }]);
    return true;
  }, []);

  const land = useCallback((f: Flight) => {
    flightCount.current = Math.max(0, flightCount.current - 1);
    setFlights((list) => list.filter((x) => x.key !== f.key));
    setArriving((a) => ({ ...a, [f.category]: Math.max(0, (a[f.category] ?? 0) - 1) }));
  }, []);

  const trackReadyRef = useRef(false);
  useEffect(() => { trackReadyRef.current = trackReady; }, [trackReady]);

  /** Releases queued decisions onto the track one at a time, once the track is open. */
  const pump = useCallback(() => {
    if (pumping.current) return;
    pumping.current = true;
    const step = () => {
      if (!trackReadyRef.current) { setTimeout(step, 100); return; }
      const d = queue.current.shift();
      if (!d) { pumping.current = false; return; }
      if (!spawn(d)) setArriving((a) => ({ ...a, [d.category]: Math.max(0, (a[d.category] ?? 0) - 1) }));
      setTimeout(step, RELEASE_MS);
    };
    step();
  }, [spawn]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const { items: next, stats: s } = await api.load(showDone);
      const fresh = [...(s.drain.run.recent ?? [])].reverse().filter((d) => !seen.current.has(d.id));
      for (const d of fresh) {
        seen.current.add(d.id);
        setArriving((a) => ({ ...a, [d.category]: (a[d.category] ?? 0) + 1 }));
        queue.current.push(d);
      }
      while (queue.current.length > QUEUE_MAX) {
        const dropped = queue.current.shift()!;
        setArriving((a) => ({ ...a, [dropped.category]: Math.max(0, (a[dropped.category] ?? 0) - 1) }));
      }
      if (fresh.length) pump();
      if (prevRunActive.current && !s.drain.run.active && s.drain.run.classified > 0 && !s.drain.run.rateLimited) {
        say({ text: `${s.drain.run.classified.toLocaleString()} new ${s.drain.run.classified === 1 ? "email" : "emails"} sorted` }, 6000);
      }
      prevRunActive.current = s.drain.run.active;
      setItems(next);
      setStats({ ...s, receivedAt: Date.now() });
      setLoaded(true);
    } finally {
      inFlight.current = false;
    }
  }, [api, showDone, pump, say]);

  useEffect(() => { load(); }, [load]);

  const run = stats?.drain.run;
  const runActive = Boolean(run?.active && !run.rateLimited);
  const syncActive = Boolean(stats?.sync.active) || syncing;
  const busy = syncActive || runActive || flights.length > 0 || Boolean(stats?.drain.inTick);

  // stage opens while work is happening, settles closed shortly after
  useEffect(() => {
    const t = setTimeout(() => setExpanded(busy), busy ? 0 : SETTLE_MS);
    return () => clearTimeout(t);
  }, [busy]);

  const live = busy;
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, live ? 300 : 30_000);
    return () => clearInterval(id);
  }, [load, live]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const poll = setInterval(load, 400);
    try {
      const r = await api.sync();
      if (!r.ok) say({ text: `Sync failed: ${r.error}` });
      else if (r.fetched === 0) say({ text: "Up to date" }, 2500);
      await load();
    } finally {
      clearInterval(poll);
      setSyncing(false);
    }
  }, [api, syncing, load, say]);

  const neverSynced = loaded && !stats?.lastSyncedAt && !syncActive && items.length === 0;

  async function feedback(m: MessageView, kind: FeedbackKind, value?: string) {
    if (kind === "corrected_category" && value && m.category) {
      setExpanded(true);
      spawn({ id: m.id, from: m.fromName || m.fromEmail, subject: m.subject, category: value as Category, confidence: 1, at: Date.now() }, m.category);
    }
    setItems((list) => list.map((x) => x.id === m.id
      ? { ...x, handled: kind === "handled" ? true : kind === "unhandled" ? false : x.handled, category: kind === "corrected_category" ? (value as Category) : x.category }
      : x));
    await api.feedback(m.id, kind, value);
    load();
  }
  const done = (m: MessageView) => {
    const undoing = m.handled;
    feedback(m, undoing ? "unhandled" : "handled");
    if (!undoing) {
      if (selectedId === m.id) setSelectedId(null);
      say({ text: "Done", undo: () => { feedback(m, "unhandled"); say(null); } }, 6000);
    }
  };
  const move = (m: MessageView, c: Category) => { if (c !== m.category) feedback(m, "corrected_category", c); };

  const byCat = useMemo(() => {
    const map: Record<string, MessageView[]> = {};
    for (const c of CATEGORY_ORDER) map[c] = [];
    for (const it of items) if (it.category && (showDone || !it.handled)) map[it.category].push(it);
    return map;
  }, [items, showDone]);

  const pending = stats?.lanes.pending ?? 0;
  const compact = !expanded;
  const firstSync = !stats?.lastSyncedAt && syncActive;


  // the bar: what it says, how full it is
  let mode: BarMode = "empty";
  let label: React.ReactNode = "Not fetched yet";
  let right: React.ReactNode = "";
  let fraction = 0;
  if (syncActive && stats) {
    mode = "fetching";
    const { phase, done, total, startedAt } = stats.sync;
    fraction = total ? done / total : 0.02;
    if (phase === "listing" || !total) label = "Fetching inbox…";
    else {
      const elapsed = startedAt ? (stats.receivedAt - startedAt) / 1000 : 0;
      const rate = elapsed > 3 && done > 0 ? done / elapsed : 0;
      const left = rate ? Math.ceil((total - done) / rate / 60) : null;
      label = <>Fetching {done.toLocaleString()} of {total.toLocaleString()}</>;
      right = left ? `about ${left} min left` : "";
    }
  } else if (runActive && run) {
    mode = "sorting";
    fraction = run.total ? run.classified / run.total : 0;
    label = <>Sorting {run.classified.toLocaleString()} of {run.total.toLocaleString()}</>;
    right = run.perSec ? `${run.perSec.toFixed(0)} per second` : "";
  } else if (pending > 0) {
    mode = "sorting";
    fraction = items.length ? (items.length - pending) / items.length : 0;
    label = `${pending.toLocaleString()} waiting to sort`;
    right = run?.rateLimited && stats?.drain.nextInMs != null ? `next ${stats.drain.burst} in ${Math.max(1, Math.round(stats.drain.nextInMs / 60000))} min` : "";
  } else if (items.length > 0) {
    mode = "idle";
    fraction = 1;
    label = <>Gmail inbox · {items.length.toLocaleString()} emails</>;
    right = stats?.lastSyncedAt ? <>Synced {ago(stats.lastSyncedAt)} · <button onClick={sync} className="underline decoration-hair-strong underline-offset-4 hover:text-ink">Sync now</button></> : "";
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-6">
      <header className="relative flex items-center justify-center py-8">
        <span className="text-[22px] font-semibold tracking-tight text-ink" title={email}>Jevmail</span>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">{signOut}</div>
      </header>

      {/* the stage: the inbox bar on top, five sorted stacks below */}
      <div ref={stageRef} className="relative mt-2">
        <ProgressBar
          ref={sourceRef}
          gateRef={jevRef}
          mode={mode}
          label={label}
          right={right}
          fraction={fraction}
          laneOpen={expanded && mode !== "fetching"}
          decision={decision}
          scanning={flights.some((f) => f.gate)}
          onLaneSettled={() => setTrackReady(expanded && mode !== "fetching")}
        />
        <div className="mt-12 grid grid-cols-5 items-end gap-4 max-md:grid-cols-3 max-md:gap-y-10">
          {CATEGORY_ORDER.map((c) => (
            <Column
              key={c}
              ref={(el) => { stackRefs.current[c] = el; }}
              label={LABEL[c]}
              tone={TONE[c]}
              count={Math.max(0, (stats?.lanes[c] ?? 0) - (arriving[c] ?? 0))}
              selected={selected === c}
              emphasized={c === "needs_reply"}
              compact={compact}
              onClick={() => { setSelected(c); setSelectedId(null); }}
            />
          ))}
        </div>
        {flights.map((f) => (
          <Preview key={f.key} from={f.from} gate={f.gate} trackY={f.trackY} to={f.to} name={f.name} subject={f.subject}
            onGate={() => setDecision((d) => (d?.key === f.key ? d : { text: f.text, category: f.category, key: f.key }))}
            onDone={() => land(f)} />
        ))}
        {flights.length === 0 && decision && <ClearDecision onClear={() => setDecision(null)} />}
      </div>

      {/* the mail */}
      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between gap-6">
          <h2 className="text-[15px] font-semibold text-ink">
            {LABEL[selected]} <span className="ml-1 text-[12px] font-normal tabular-nums text-ash">{byCat[selected].length}</span>
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); } }}
            placeholder="Search"
            aria-label="Search"
            className="w-52 rounded-lg bg-white px-3 py-1.5 text-[13px] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] placeholder:text-ash focus:outline-none focus:ring-2 focus:ring-shu/30"
          />
        </div>
        {neverSynced ? (
          <div className="py-24 text-center">
            <p className="text-[13px] text-ash">Your inbox hasn&apos;t been fetched yet.</p>
            <button onClick={sync} className="mt-6 rounded-full bg-shu px-5 py-2 text-[13px] font-medium text-white shadow-sm transition-opacity hover:opacity-90">
              Fetch emails
            </button>
            <p className="mt-4 text-[12px] text-ash">Sorting starts as soon as the fetch finishes.</p>
          </div>
        ) : loaded && (
          <MessageList
            items={byCat[selected]}
            query={query}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDone={done}
            onMove={move}
            emptyText={firstSync ? "Fetching your inbox. Sorting starts when that finishes." : pending > 0 ? "Sorting…" : selected === "needs_reply" ? "Nothing needs a reply." : `Nothing in ${LABEL[selected]}.`}
          />
        )}
      </section>

      <footer className="mt-20 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-hair py-6 text-[11px] tracking-[0.02em] text-ash">
        <span>
          Sorted by Jev
          {stats && stats.classified > 0 && <> · {stats.classified.toLocaleString()} emails · {usd(stats.usd)}</>}
        </span>
        <span className="flex items-center gap-4">
          <span><kbd>j</kbd> <kbd>k</kbd> move · <kbd>e</kbd> done · <kbd>o</kbd> open · <kbd>esc</kbd> close</span>
          <button onClick={() => setShowDone((v) => !v)} className="underline decoration-hair-strong underline-offset-4 hover:text-ink">{showDone ? "Hide done" : "Show done"}</button>
        </span>
      </footer>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("fixed bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full bg-white px-4 py-2 text-[13px] text-ink shadow-[0_4px_16px_rgba(0,0,0,0.12)]")}>
            {toast.text}
            {toast.undo && <button onClick={toast.undo} className="text-ash underline decoration-hair-strong underline-offset-4 hover:text-ink">Undo</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClearDecision({ onClear }: { onClear: () => void }) {
  useEffect(() => { const t = setTimeout(onClear, 1200); return () => clearTimeout(t); }, [onClear]);
  return null;
}
