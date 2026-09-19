"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const LINE_PITCH = 3; // px per sheet
export const MAX_LINES = 44;

/** A stack of paper seen edge-on: one thin line per email, growing upward from the shelf. */
const Stack = forwardRef<HTMLDivElement, {
  count: number; tone?: string; width?: number; maxLines?: number; className?: string;
}>(function Stack({ count, tone, width = 56, maxLines = MAX_LINES, className }, ref) {
  const lines = Math.min(maxLines, count);
  const height = lines * LINE_PITCH;
  return (
    <div ref={ref} className={cn("relative transition-[height] duration-300 ease-out", className)} style={{ width, height: maxLines * LINE_PITCH }}>
      <div
        className="absolute bottom-0 left-0 w-full transition-[height] duration-300 ease-out"
        style={{
          height,
          backgroundImage: `repeating-linear-gradient(to top, var(--ink) 0 1px, transparent 1px ${LINE_PITCH}px)`,
          opacity: 0.5,
        }}
      />
      {lines > 0 && tone && <div className="absolute left-0 w-full transition-[bottom] duration-300 ease-out" style={{ bottom: height - 1, height: 1, background: tone }} />}
    </div>
  );
});
export default Stack;
