"use client";

import { useId } from "react";

/**
 * An open tray in the style of Apple's app icons: gradient front, darker
 * interior, a few paper edges peeking above the rim when it holds mail.
 */
export default function BoxIcon({ tone, sheets = 0, size = 104, selected = false }: { tone: string; sheets?: number; size?: number; selected?: boolean }) {
  const id = useId().replace(/:/g, "");
  const h = size * 0.78;
  // 1–9 → one edge, 10–99 → two, 100+ → three
  const edges = sheets <= 0 ? 0 : sheets < 10 ? 1 : sheets < 100 ? 2 : 3;
  return (
    <svg width={size} height={h} viewBox="0 0 104 81" role="img" aria-hidden>
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#000" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`${id}-sheet`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e9e9ee" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {/* shadow */}
      <ellipse cx="52" cy="76" rx="38" ry="4" fill="#000" opacity="0.12" filter={`url(#${id}-shadow)`} />
      {/* back wall */}
      <rect x="12" y="18" width="80" height="36" rx="8" fill={tone} />
      <rect x="12" y="18" width="80" height="36" rx="8" fill={`url(#${id}-inner)`} />
      {/* paper edges: thin slivers above the rim, staggered */}
      {Array.from({ length: edges }, (_, i) => {
        const rise = 4 + i * 3;           // how far this sheet shows above the rim
        const inset = 18 + i * 3;
        return <rect key={i} x={inset} y={34 - rise} width={104 - inset * 2} height={rise + 6} rx="2" fill={`url(#${id}-sheet)`} opacity={0.95 - i * 0.15} />;
      })}
      {/* front face */}
      <rect x="6" y="34" width="92" height="38" rx="11" fill={tone} />
      <rect x="6" y="34" width="92" height="38" rx="11" fill={`url(#${id}-front)`} />
      <rect x="10" y="35.5" width="84" height="2.5" rx="1.25" fill="#fff" opacity="0.5" />
      {/* selection ring */}
      {selected && <rect x="2" y="30" width="100" height="46" rx="14" fill="none" stroke={tone} strokeOpacity="0.5" strokeWidth="2" />}
    </svg>
  );
}
