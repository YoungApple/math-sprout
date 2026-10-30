import { CaptureWorkspace, type CaptureMode } from "@/components/HomeworkChecker";

export const dynamic = "force-dynamic";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const sp = await searchParams;
  const initialMode: CaptureMode = sp.mode === "single" ? "single" : "check";

  return <CaptureWorkspace initialMode={initialMode} />;
}
