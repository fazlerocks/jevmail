"use client";

import { motion } from "motion/react";

export type Point = { x: number; y: number };
export const CARD_W = 180;
export const CARD_H = 38;
const SHEET_W = 56;

/**
 * One email in flight, shown as a real preview (sender, subject).
 * Rises from the source stack to the track, crosses the Jev gate, then drops
 * and folds into a single sheet on its stack.
 */
export default function Preview({ from, gate, trackY, to, name, subject, onGate, onDone }: {
  from: Point; gate?: Point; trackY: number; to: Point; name: string; subject: string; onGate?: () => void; onDone: () => void;
}) {
  const withGate = Boolean(gate);
  const xs = withGate ? [from.x, from.x, gate!.x, to.x, to.x] : [from.x, to.x];
  const ys = withGate ? [from.y, trackY, trackY, trackY, to.y] : [from.y, to.y];
  const ws = withGate ? [SHEET_W, CARD_W, CARD_W, CARD_W, SHEET_W] : [SHEET_W, SHEET_W];
  const hs = withGate ? [2, CARD_H, CARD_H, CARD_H, 2] : [2, 2];
  const times = withGate ? [0, 0.14, 0.46, 0.82, 1] : [0, 1];
  const textOp = withGate ? [0, 1, 1, 1, 0] : [0, 0];
  const duration = withGate ? 1.4 : 0.5;
  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-20 overflow-hidden rounded-lg bg-white shadow-[0_2px_8px_rgba(0,0,0,0.10)] max-md:hidden"
      style={{ marginLeft: -CARD_W / 2, marginTop: -CARD_H / 2, transformOrigin: "center" }}
      initial={{ x: from.x, y: from.y, width: SHEET_W, height: 2, opacity: 0 }}
      animate={{ x: xs, y: ys, width: ws, height: hs, opacity: withGate ? [0, 1, 1, 1, 0.5] : [0.6, 0.2] }}
      transition={{ duration, times, ease: "easeInOut" }}
      onUpdate={gate && onGate ? (latest) => { if (typeof latest.x === "number" && Math.abs(latest.x - gate.x) < 2.5) onGate(); } : undefined}
      onAnimationComplete={onDone}
    >
      <motion.div className="flex h-full flex-col justify-center px-3" animate={{ opacity: textOp }} transition={{ duration, times }}>
        <div className="truncate text-[11px] font-medium leading-tight text-ink">{name}</div>
        <div className="truncate text-[11px] leading-tight text-ash">{subject || "(no subject)"}</div>
      </motion.div>
    </motion.div>
  );
}
