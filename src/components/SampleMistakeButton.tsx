"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function SampleMistakeButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createSample() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/mistakes/sample", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "生成示例失败");
      }
      router.push(`/mistakes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出错了");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={createSample}
        disabled={busy}
        className={`btn-ghost w-full sm:w-auto ${className}`.trim()}
      >
        {busy ? "正在准备示例错题…" : "✨ 一键体验示例错题（免拍照）"}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
