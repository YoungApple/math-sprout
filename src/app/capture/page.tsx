"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

type Phase = "idle" | "uploading" | "done" | "error";

/**
 * Zero-friction capture: <input capture="environment"> opens the rear camera directly on
 * iOS/Android; the photo is downscaled client-side (max 1600px JPEG) before upload so a
 * 12MP shot becomes ~300KB and the Gemini call stays fast.
 */
export default function CapturePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await downscale(file, 1600, 0.85);
    setBlob(resized);
    setPreview(URL.createObjectURL(resized));
    setPhase("idle");
    setError("");
  }

  async function submit() {
    if (!blob) return;
    setPhase("uploading");
    const fd = new FormData();
    fd.append("image", blob, "mistake.jpg");
    if (note) fd.append("note", note);
    if (source) fd.append("source", source);
    try {
      const res = await apiFetch("/api/mistakes", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上传失败");
      setPhase("done");
      router.push(`/mistakes/${data.id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "出错了");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">录入错题</h1>
      <p className="text-sm text-slate-500">对准一道错题（包含孩子的手写过程和批改痕迹）拍照，AI 会自动识别题干、分析错因并出 3 道举一反三题。</p>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />

      {preview ? (
        <div className="card space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="错题预览" className="max-h-[50vh] w-full rounded-xl object-contain bg-slate-50" />
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="来源（可选）：如 三下期中卷 / 课堂作业"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注给 AI（可选）：如 孩子说没看懂“至少”"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => inputRef.current?.click()} disabled={phase === "uploading"}>重拍</button>
            <button className="btn-primary flex-[2]" onClick={submit} disabled={phase === "uploading"}>
              {phase === "uploading" ? "AI 诊断中…（约 10 秒）" : "✨ 开始 AI 诊断"}
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="card flex w-full flex-col items-center gap-2 py-14 text-sprout-700 hover:bg-sprout-50">
          <span className="text-5xl">📷</span>
          <span className="font-semibold">点击拍照 / 选择图片</span>
          <span className="text-xs text-slate-400">支持手机、iPad 直接调用相机</span>
        </button>
      )}
    </div>
  );
}

async function downscale(file: File, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}
