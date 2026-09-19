"use client";

import { forwardRef } from "react";
import { motion } from "motion/react";
import type { Category } from "@/db/schema";
import { TONE } from "./types";

/** The gate on the track: a hairline the previews cross. Only the decision is shown. */
const JevNode = forwardRef<HTMLDivElement, {
  decision: { text: string; category: Category; key: number } | null; scanning: boolean; height: number;
}>(function JevNode({ decision, scanning, height }, ref) {
  return (
    <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
      <div className="h-6 whitespace-nowrap text-[13px] leading-none tabular-nums">
        {decision && (
          <motion.span key={decision.key} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} style={{ color: TONE[decision.category] }}>
            {decision.text}
          </motion.span>
        )}
      </div>
      <div ref={ref} className="relative w-px bg-hair-strong" style={{ height }}>
        {scanning && <motion.div className="absolute left-0 top-0 w-px bg-shu" animate={{ height: ["0%", "100%", "0%"] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} />}
      </div>
      <div className="mt-2 text-[12px] tracking-[0.02em] text-ash">Jev</div>
    </div>
  );
});
export default JevNode;
