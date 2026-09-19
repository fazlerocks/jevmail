import { cn } from "@/lib/utils";

/** A key cap for shortcut hints: mono, small, quiet. */
export default function Key({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-hair-strong/70 bg-white px-1.5 font-mono text-[10.5px] leading-none text-ash shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]", className)}>
      {children}
    </kbd>
  );
}
