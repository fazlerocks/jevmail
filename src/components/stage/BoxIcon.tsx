"use client";

import { useId } from "react";

/**
 * An open tray in the style of Apple's app icons: soft gradient faces, a darker
 * interior, a few sheets peeking out when it holds mail, a soft shadow beneath.
 */
export default function BoxIcon({ tone, sheets = 0, size = 104, selected = false }: { tone: string; sheets?: number; size?: number; selected?: boolean }) {
  const id = useId().replace(/:/g, "");
  const h = size * 0.78;
  return (
    <svg width={size} height={h} viewBox="0 0 104 81" role="img" aria-hidden>
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.38" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {/* shadow */}
      <ellipse cx="52" cy="76" rx="38" ry="4" fill="#000" opacity="0.12" filter={`url(#${id}-shadow)`} />
      {/* back wall */}
      <rect x="12" y="10" width="80" height="44" rx="9" fill={tone} />
      <rect x="12" y="10" width="80" height="44" rx="9" fill={`url(#${id}-inner)`} />
      {/* sheets peeking out */}
      {Array.from({ length: Math.min(4, sheets) }, (_, i) => (
        <rect key={i} x={20 + i * 2} y={16 - i * 2.5} width={64 - i * 4} height="30" rx="4" fill="#fff" opacity={0.92 - i * 0.12} />
      ))}
      {/* front face */}
      <rect x="6" y="34" width="92" height="38" rx="11" fill={tone} />
      <rect x="6" y="34" width="92" height="38" rx="11" fill={`url(#${id}-front)`} />
      {/* rim highlight */}
      <rect x="10" y="35.5" width="84" height="2.5" rx="1.25" fill="#fff" opacity="0.55" />
      {/* selection ring */}
      {selected && <rect x="2" y="30" width="100" height="46" rx="14" fill="none" stroke={tone} strokeOpacity="0.5" strokeWidth="2" />}
    </svg>
  );
}
