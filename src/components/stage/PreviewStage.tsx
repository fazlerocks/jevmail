"use client";

import { useEffect, useMemo } from "react";
import Stage from "@/components/Stage";
import { Simulator } from "./simulator";

export default function PreviewStage({ total, rate }: { total: number; rate: number }) {
  const sim = useMemo(() => new Simulator(total, rate), [total, rate]);
  // dev-only handle for inspecting the live instance from the console
  useEffect(() => { (window as unknown as { __sim?: Simulator }).__sim = sim; }, [sim]);
  return <Stage email="preview" signOut={<span className="text-[12px] tracking-[0.04em] text-ash">preview · {rate}/s</span>} api={sim} />;
}
