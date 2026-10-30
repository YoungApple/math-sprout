"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function DeleteMistakeButton({ mistakeId }: { mistakeId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/mistakes/${mistakeId}`, { method: "DELETE" });
      if (res.ok) {
        router.replace("/mistakes");
        router.refresh();
        return;
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        删除错题
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-xs">
      <span className="text-rose-700">确认删除？</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="font-semibold text-rose-600 hover:underline disabled:opacity-50"
      >
        {busy ? "删除中…" : "确认"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-slate-500 hover:underline"
      >
        取消
      </button>
    </span>
  );
}
