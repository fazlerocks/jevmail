"use client";

import { useMemo } from "react";
import Stage from "@/components/Stage";
import { Simulator } from "./simulator";

export default function PreviewStage({ total, rate }: { total: number; rate: number }) {
  const sim = useMemo(() => new Simulator(total, rate), [total, rate]);
  return <Stage email="preview" signOut={<span className="text-[12px] tracking-[0.04em] text-ash">preview · {rate}/s</span>} api={sim} />;
}
