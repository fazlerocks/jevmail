"use client";

import { forwardRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import BoxIcon from "./BoxIcon";

/** A category as a tray: count above, the box, label below. The ref marks the box opening. */
const Column = forwardRef<HTMLDivElement, {
  label: string; tone: string; count: number; selected: boolean; emphasized?: boolean; compact: boolean; onClick: () => void;
}>(function Column({ label, tone, count, selected, emphasized, compact, onClick }, ref) {
  const size = compact ? 72 : 104;
  return (
    <button onClick={onClick} className="group flex w-full flex-col items-center gap-2 text-center">
      <div className={cn("tabular-nums text-ink transition-all duration-300 max-md:text-[18px]", compact ? "text-[20px] font-medium leading-none" : emphasized ? "text-[36px] font-semibold leading-none" : "text-[32px] font-medium leading-none")}>
        {count.toLocaleString()}
      </div>
      <motion.div key={count} className="relative transition-transform duration-200 group-hover:-translate-y-0.5 max-md:origin-bottom max-md:scale-[0.68]" initial={{ scale: count ? 1.04 : 1 }} animate={{ scale: 1 }} transition={{ duration: 0.25 }}>
        <BoxIcon tone={tone} sheets={count} size={size} selected={selected} />
        {/* the opening: where mail lands */}
        <div ref={ref} className="absolute left-1/2 size-0" style={{ top: size * 0.2 }} />
      </motion.div>
      <div className={cn("text-[12px] max-md:-mt-1 max-md:text-[11px]", selected ? "font-medium text-ink" : "text-ash")}>{label}</div>
    </button>
  );
});
export default Column;
