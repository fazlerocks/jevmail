"use client";

import { forwardRef, type ReactNode } from "react";
import { motion } from "motion/react";
import type { Category } from "@/db/schema";
import { TONE } from "./types";
import GmailMark from "./GmailMark";

export const LANE_H = 46;   // room for a preview card riding the bar
export const DECISION_H = 22;

export type BarMode = "empty" | "fetching" | "sorting" | "idle";

/**
 * The inbox as a bar. Fills while fetching, carries previews across the Jev
 * tick while sorting, and rests as a labeled line otherwise. Never blank.
 */
const ProgressBar = forwardRef<HTMLDivElement, {
  mode: BarMode;
  label: ReactNode;
  right: ReactNode;
  fraction: number;            // 0..1 fill
  laneOpen: boolean;           // preview lane above the bar
  decision: { text: string; category: Category; key: number } | null;
  scanning: boolean;
  gateRef: React.Ref<HTMLDivElement>;
  onLaneSettled: () => void;
}>(function ProgressBar({ mode, label, right, fraction, laneOpen, decision, scanning, gateRef, onLaneSettled }, startRef) {
  const fillTone = mode === "idle" ? "var(--hair-strong)" : "var(--shu)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 text-[13px]">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ash">Source</span>
          <span className="ml-1 flex items-center gap-2 font-medium text-ink"><GmailMark /> {label}</span>
        </span>
        <span className="whitespace-nowrap text-ash">{right}</span>
      </div>

      {/* preview lane, open only while sorting */}
      <motion.div className="relative overflow-hidden" initial={false} animate={{ height: laneOpen ? DECISION_H + LANE_H : 0 }} transition={{ duration: 0.35, ease: "easeInOut" }} onAnimationComplete={onLaneSettled}>
        <div className="absolute left-1/2 top-0 h-[22px] -translate-x-1/2 whitespace-nowrap text-[13px] leading-none tabular-nums">
          {decision && (
            <motion.span key={decision.key} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} style={{ color: TONE[decision.category] }}>
              {decision.text}
            </motion.span>
          )}
        </div>
      </motion.div>

      {/* the bar */}
      <div className="relative mt-3 h-1.5 w-full rounded-full bg-hair">
        <div ref={startRef} className="absolute left-0 top-1/2 size-0" />
        <motion.div className="absolute left-0 top-0 h-1.5 rounded-full" style={{ background: fillTone }} initial={false} animate={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%` }} transition={{ duration: 0.3, ease: "easeOut" }} />
        {/* the Jev checkpoint at the midpoint, present only while sorting */}
        <motion.div ref={gateRef} className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ash shadow-sm" initial={false} animate={{ opacity: mode === "sorting" ? 1 : 0, scale: mode === "sorting" ? 1 : 0.5 }} transition={{ duration: 0.25 }}>
          {scanning && <motion.div className="absolute inset-0 rounded-full bg-shu" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} />}
        </motion.div>
      </div>
      <motion.div className="mt-2 text-center text-[11px] font-medium text-ash" initial={false} animate={{ opacity: mode === "sorting" ? 1 : 0 }} transition={{ duration: 0.25 }}>Jev</motion.div>
    </div>
  );
});
export default ProgressBar;
