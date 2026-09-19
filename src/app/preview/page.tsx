import { notFound } from "next/navigation";
import PreviewStage from "@/components/stage/PreviewStage";

/** Dev-only: the stage driven by a simulator, no Google or Jev needed. /preview?total=300&rate=20 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ total?: string; rate?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { total, rate } = await searchParams;
  return <PreviewStage total={Number(total ?? 300)} rate={Number(rate ?? 20)} />;
}
