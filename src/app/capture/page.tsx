"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

type Phase = "idle" | "decoding" | "uploading" | "done" | "error";

const DIAGNOSIS_STAGES = [
  { atSec: 0, label: "正在上传压缩后的清晰题目照片…" },
  { atSec: 3, label: "AI 老师正在识别题干与孩子的手写算式…" },
  { atSec: 9, label: "正在逐步比对解题过程，定位思维卡点…" },
  { atSec: 15, label: "正在生成启发提示与 3 道同年级举一反三题…" },
];

/**
 * Dual-entry capture:
 * - "直接拍照" opens the rear camera directly (`capture="environment"`).
 * - "相册/微信选图" opens the photo library so parents can upload teacher-sent photos.
 * Downscales client-side to <=1600px JPEG with EXIF orientation, closes ImageBitmap, and guards HEIC.
 */
export default function CapturePage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (phase !== "uploading") {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhase("decoding");
    setError("");
    try {
      const resized = await normalizeToJpeg(file, 1600, 0.85);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(resized);
      });
      setBlob(resized);
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "图片解析失败，请换一张 JPG/PNG 照片试试");
    }
  }

  async function submit() {
    if (!blob) return;
    setPhase("uploading");
    setError("");
    const fd = new FormData();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    fd.append("image", blob, `mistake.${ext}`);
    if (note.trim()) fd.append("note", note.trim());
    if (source.trim()) fd.append("source", source.trim());

    try {
      const res = await apiFetch("/api/mistakes", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "AI 诊断失败，请稍后重试");
      }
      setPhase("done");
      router.push(`/mistakes/${data.id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "上传出错了，请重试");
    }
  }

  const activeStage =
    [...DIAGNOSIS_STAGES].reverse().find((s) => elapsedSec >= s.atSec)?.label ?? DIAGNOSIS_STAGES[0].label;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">录入错题</h1>
      <p className="text-sm text-slate-500">
        对准一道错题（尽量包含孩子的手写步骤和红笔批改痕迹）拍照或从微信/相册选图，AI 会识别题干、找准错因并出 3 道变式题。
      </p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={onPick}
      />

      {preview ? (
        <div className="card space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="错题预览" className="max-h-[48vh] w-full rounded-xl bg-slate-50 object-contain" />
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={phase === "uploading"}
            placeholder="来源（可选）：如 三下期中卷 / 周末练习"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={phase === "uploading"}
            placeholder="给 AI 的备注（可选）：如 孩子说没看懂“比…多几倍”"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          {phase === "uploading" && (
            <div className="rounded-xl bg-sprout-50 p-3 text-xs text-sprout-700">
              <div className="flex items-center justify-between font-semibold">
                <span>✨ {activeStage}</span>
                <span>{elapsedSec}s</span>
              </div>
              <p className="mt-1 text-slate-500">预计需要 15–20 秒完成审题、错因定位与变式验算，请勿关闭页面。</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={phase === "uploading"}
            >
              重拍
            </button>
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => albumInputRef.current?.click()}
              disabled={phase === "uploading"}
            >
              换张图
            </button>
            <button
              type="button"
              className="btn-primary w-full sm:flex-[2]"
              onClick={submit}
              disabled={phase === "uploading" || phase === "decoding"}
            >
              {phase === "uploading" ? `AI 诊断中（${elapsedSec}s）…` : "✨ 开始 AI 诊断"}
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={phase === "decoding"}
              className="card flex flex-col items-center gap-2 py-10 text-sprout-700 transition hover:bg-sprout-50"
            >
              <span className="text-4xl">📷</span>
              <span className="font-semibold">直接拍照录题</span>
              <span className="text-xs text-slate-400">手机 / iPad 直接调用后置相机</span>
            </button>

            <button
              type="button"
              onClick={() => albumInputRef.current?.click()}
              disabled={phase === "decoding"}
              className="card flex flex-col items-center gap-2 py-10 text-slate-700 transition hover:bg-sprout-50"
            >
              <span className="text-4xl">🖼️</span>
              <span className="font-semibold">从相册 / 微信选图</span>
              <span className="text-xs text-slate-400">支持老师发在微信里的试卷照片</span>
            </button>
          </div>
          {phase === "decoding" && <p className="text-center text-sm text-slate-500">正在处理图片…</p>}
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function isHeicFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") || /\.(heic|heif)$/i.test(file.name);
}

async function normalizeToJpeg(file: File, maxSide: number, quality: number): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    if (bitmap) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.type === "image/jpeg" && file.size <= 1_500_000) {
        return file;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("浏览器画布初始化失败");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (out) return out;
    }
  } finally {
    bitmap?.close();
  }

  // Fallback via HTMLImageElement (handles Safari/WebKit formats when createImageBitmap fails)
  const decodedViaImg = await decodeViaImgElement(file, maxSide, quality);
  if (decodedViaImg) return decodedViaImg;

  if (isHeicFile(file)) {
    throw new Error(
      "当前浏览器无法直接解析苹果 HEIC 格式原图。请在 iPhone「设置 → 相机 → 格式」中选「兼容性最好」，或先截图再上传。",
    );
  }
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
    return file;
  }
  throw new Error("不支持该图片格式，请选择 JPG、PNG 或 WebP 图片。");
}

function decodeViaImgElement(file: File, maxSide: number, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}
