"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import Stack, { MAX_LINES } from "./Stack";

export const COMPACT_LINES = 12;

/** A category on the shelf: count, paper stack, shelf line, label. Compact between syncs. */
const Column = forwardRef<HTMLDivElement, {
  label: string; tone: string; count: number; selected: boolean; emphasized?: boolean; compact: boolean; onClick: () => void;
}>(function Column({ label, tone, count, selected, emphasized, compact, onClick }, ref) {
  return (
    <button onClick={onClick} className={cn("group flex w-full flex-col items-start text-left", !selected && "hover:opacity-80")}>
      <div className={cn("font-light tabular-nums text-ink transition-all duration-300", compact ? "h-[24px] text-[22px] leading-none" : emphasized ? "h-[52px] text-[52px] leading-none" : "h-[52px] pt-2 text-[44px] leading-none")}>
        {count.toLocaleString()}
      </div>
      <div className="mt-3 w-full border-b border-hair-strong">
        <Stack ref={ref} count={count} tone={tone} maxLines={compact ? COMPACT_LINES : MAX_LINES} />
      </div>
      <div className={cn("mt-2.5 flex items-center gap-2 text-[12px] tracking-[0.02em]", selected ? "text-ink" : "text-ash")}>
        <span className="size-1.5 rounded-full" style={{ background: tone }} />
        <span className={cn(selected && "underline underline-offset-4 decoration-hair-strong")}>{label}</span>
      </div>
    </button>
  );
});
export default Column;
