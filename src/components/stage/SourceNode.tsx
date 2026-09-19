"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import Stack, { MAX_LINES } from "./Stack";
import { COMPACT_LINES } from "./Column";

const SourceNode = forwardRef<HTMLDivElement, {
  pulled: number; syncing: boolean; phase: "idle" | "listing" | "fetching"; done: number; total: number; compact: boolean;
}>(function SourceNode({ pulled, syncing, phase, done, total, compact }, ref) {
  const shown = syncing && total ? done : pulled;
  return (
    <div className="flex w-full flex-col items-start">
      <div className={cn("font-light tabular-nums text-ink transition-all duration-300", compact ? "h-[24px] text-[22px] leading-none" : "h-[52px] pt-2 text-[44px] leading-none")}>
        {shown > 0 ? shown.toLocaleString() : <span className="text-ash">0</span>}
      </div>
      <div className="mt-3 w-full border-b border-hair-strong">
        <Stack ref={ref} count={shown} maxLines={compact ? COMPACT_LINES : MAX_LINES} />
      </div>
      <div className="mt-2.5 whitespace-nowrap text-[12px] tracking-[0.02em] text-ash">
        {syncing ? (phase === "listing" ? "Syncing…" : `Syncing ${done.toLocaleString()} of ${total.toLocaleString()}`) : "Inbox"}
      </div>
    </div>
  );
});
export default SourceNode;
