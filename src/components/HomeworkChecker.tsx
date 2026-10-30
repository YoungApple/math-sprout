"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";
import type {
  CheckVerdict,
  CheckedProblemItem,
  HomeworkCheckResult,
} from "@/lib/homework-check";
import { GRADES, TERMS, type Term } from "@/lib/taxonomy";
import { MathText } from "./MathText";
import { ERROR_LABELS, ErrorBadge } from "./StatusBadge";

export type CaptureMode = "check" | "single";

const CHECK_STAGES = [
  { atSec: 0, short: "上传作业页", label: "正在上传高清作业页…" },
  { atSec: 3, short: "框选识别", label: "正在逐题框选识别题干与手写作答…" },
  { atSec: 9, short: "交叉验算", label: "正在交叉验算每道题答案…" },
  { atSec: 15, short: "汇总报告", label: "正在汇总批改报告…" },
];

const SINGLE_STAGES = [
  { atSec: 0, label: "正在上传压缩后的清晰题目照片…" },
  { atSec: 3, label: "AI 老师正在识别题干与孩子的手写算式…" },
  { atSec: 9, label: "正在逐步比对解题过程，定位思维卡点…" },
  { atSec: 15, label: "正在生成启发提示与 3 道同年级举一反三题…" },
];

const VERDICT_STYLE: Record<
  CheckVerdict,
  {
    icon: string;
    text: string;
    pillCls: string;
    boxCls: string;
    boxActiveCls: string;
    tagCls: string;
    cardBorderCls: string;
  }
> = {
  CORRECT: {
    icon: "✅",
    text: "做对",
    pillCls: "bg-emerald-100 text-emerald-800",
    boxCls: "border-emerald-500/80 bg-emerald-500/10 hover:bg-emerald-500/20",
    boxActiveCls: "border-emerald-600 bg-emerald-500/25 ring-4 ring-emerald-500/40 z-20",
    tagCls: "bg-emerald-600 text-white",
    cardBorderCls: "border-emerald-200/80 bg-white",
  },
  WRONG: {
    icon: "❌",
    text: "做错",
    pillCls: "bg-rose-100 text-rose-800",
    boxCls: "border-rose-500/90 bg-rose-500/15 hover:bg-rose-500/25",
    boxActiveCls: "border-rose-600 bg-rose-500/25 ring-4 ring-rose-500/45 z-20",
    tagCls: "bg-rose-600 text-white",
    cardBorderCls: "border-rose-300 bg-rose-50/25",
  },
  BLANK: {
    icon: "⚪",
    text: "未作答",
    pillCls: "bg-amber-100 text-amber-800",
    boxCls: "border-amber-500/90 bg-amber-500/15 hover:bg-amber-500/25",
    boxActiveCls: "border-amber-600 bg-amber-500/25 ring-4 ring-amber-500/45 z-20",
    tagCls: "bg-amber-500 text-white",
    cardBorderCls: "border-amber-300 bg-amber-50/25",
  },
};

function revokeIfBlobUrl(url: string | null) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Dual-mode capture workspace (`/capture`):
 * - Tab 1 (`check`): Whole-page homework checker + interactive annotated overlay + batch mistake import.
 * - Tab 2 (`single`): Single-problem close-up capture with optional grade/term/source metadata.
 */
export function CaptureWorkspace({ initialMode = "check" }: { initialMode?: CaptureMode }) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function switchMode(next: CaptureMode) {
    setMode(next);
    if (typeof window !== "undefined") {
      const target = next === "single" ? "/capture?mode=single" : "/capture?mode=check";
      window.history.replaceState(null, "", target);
    }
  }

  return (
    <div className="space-y-4">
      {/* Segmented Dual-Mode Tab Bar */}
      <div className="rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
        <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="批改与录题模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "check"}
            onClick={() => switchMode("check")}
            className={`rounded-xl px-3 py-2.5 text-left transition ${
              mode === "check"
                ? "bg-sprout-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-sprout-50"
            }`}
          >
            <div className="text-sm font-bold">📝 整页作业检查</div>
            <div className={`mt-0.5 text-[11px] leading-snug ${mode === "check" ? "text-white/90" : "text-slate-400"}`}>
              拍整页口算/练习册，AI 逐题批改对错并一键收错题
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => switchMode("single")}
            className={`rounded-xl px-3 py-2.5 text-left transition ${
              mode === "single"
                ? "bg-sprout-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-sprout-50"
            }`}
          >
            <div className="text-sm font-bold">🔍 单题直接录错</div>
            <div
              className={`mt-0.5 text-[11px] leading-snug ${mode === "single" ? "text-white/90" : "text-slate-400"}`}
            >
              拍单道错题特写，直接诊断并出 3 道变式
            </div>
          </button>
        </div>
      </div>

      {mode === "check" ? <HomeworkChecker /> : <SingleProblemCapture />}
    </div>
  );
}

/**
 * Whole-page homework checker (`HomeworkChecker`):
 * - Upload photo (`maxSide = 2000`) or load zero-wait sample (`POST /api/homework-check?sample=1`).
 * - Editable metadata bar (`年级`, `学期`, `来源`, `备注`) auto-populated from AI detection when left blank.
 * - Interactive annotated worksheet preview with percentage `box_2d` overlays.
 * - Scorecard summary + problem-by-problem review list + `<canvas>` auto-cropped batch mistake import.
 */
export function HomeworkChecker() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);

  const [grade, setGrade] = useState<number | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [phase, setPhase] = useState<"idle" | "decoding" | "checking" | "checked" | "error">("idle");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");

  const [result, setResult] = useState<HomeworkCheckResult | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showCorrectDetails, setShowCorrectDetails] = useState(true);

  const [importing, setImporting] = useState(false);
  const [importProgressText, setImportProgressText] = useState("");
  const [importedByIdx, setImportedByIdx] = useState<Record<number, string>>({});
  const [importOrder, setImportOrder] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (phase !== "checking") {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function applyCheckResult(data: HomeworkCheckResult, nextPreviewUrl?: string) {
    if (nextPreviewUrl) {
      setPreviewUrl((prev) => {
        revokeIfBlobUrl(prev);
        return nextPreviewUrl;
      });
    }
    setResult(data);
    // Pre-fill grade, term, and detected_source if user left them blank
    setGrade((prev) => prev ?? (data.grade >= 1 && data.grade <= 6 ? data.grade : null));
    setTerm((prev) => prev ?? (data.term ?? null));
    setSource((prev) => (prev.trim() ? prev : data.detected_source || ""));

    // Pre-check WRONG and BLANK items by default
    const defaults = new Set<number>();
    let firstFocus: number | null = null;
    data.items.forEach((it, idx) => {
      if (it.verdict === "WRONG" || it.verdict === "BLANK") {
        defaults.add(idx);
        if (firstFocus === null) firstFocus = idx;
      }
    });
    setSelectedIndices(defaults);
    setActiveIdx(firstFocus ?? (data.items.length > 0 ? 0 : null));
    setShowCorrectDetails(data.items.length <= 6);
    setImportedByIdx({});
    setImportOrder([]);
    setImportErrors({});
    setPhase("checked");
  }

  async function onPickWorksheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhase("decoding");
    setError("");
    setResult(null);
    setImportedByIdx({});
    setImportOrder([]);
    setImportErrors({});

    try {
      const normalized = await normalizeToJpeg(file, 2000, 0.88);
      setSourceBlob(normalized);
      setPreviewUrl((prev) => {
        revokeIfBlobUrl(prev);
        return URL.createObjectURL(normalized);
      });
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "图片解析失败，请换一张清晰 JPG/PNG 照片试试");
    }
  }

  async function runHomeworkCheck() {
    if (!sourceBlob) return;
    setPhase("checking");
    setError("");
    const fd = new FormData();
    const ext = sourceBlob.type === "image/png" ? "png" : sourceBlob.type === "image/webp" ? "webp" : "jpg";
    fd.append("image", sourceBlob, `homework.${ext}`);
    if (note.trim()) fd.append("note", note.trim());
    if (grade !== null) fd.append("grade", String(grade));
    if (term) fd.append("term", term);
    if (source.trim()) fd.append("source", source.trim());

    try {
      const res = await apiFetch("/api/homework-check", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as Partial<HomeworkCheckResult> & { error?: string };
      if (!res.ok || !Array.isArray(data.items) || !data.summary) {
        throw new Error(data.error ?? "整页作业批改失败，请重试");
      }
      applyCheckResult(data as HomeworkCheckResult);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "批改请求出错了，请稍后重试");
    }
  }

  async function loadSampleCheck() {
    setSampleLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/homework-check?sample=1", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Partial<HomeworkCheckResult> & { error?: string };
      if (!res.ok || !Array.isArray(data.items) || !data.summary) {
        throw new Error(data.error ?? "加载整页批改示例失败");
      }
      setSourceBlob(null);
      applyCheckResult(data as HomeworkCheckResult, data.sampleImageUrl ?? undefined);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "加载示例失败");
    } finally {
      setSampleLoading(false);
    }
  }

  function resetSheet() {
    setPreviewUrl((prev) => {
      revokeIfBlobUrl(prev);
      return null;
    });
    setSourceBlob(null);
    setResult(null);
    setActiveIdx(null);
    setSelectedIndices(new Set());
    setImportedByIdx({});
    setImportOrder([]);
    setImportErrors({});
    setError("");
    setPhase("idle");
  }

  function toggleSelect(idx: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function focusProblemFromOverlay(idx: number, verdict: CheckVerdict) {
    setActiveIdx(idx);
    if (verdict === "CORRECT" && !showCorrectDetails) {
      setShowCorrectDetails(true);
    }
    requestAnimationFrame(() => {
      cardRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function importSelectedMistakes() {
    if (!result || importing) return;
    const queue = result.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ idx }) => selectedIndices.has(idx) && !importedByIdx[idx]);
    if (queue.length === 0) return;

    setImporting(true);
    setImportErrors({});

    try {
      const loadedImg = previewUrl ? await loadHtmlImage(previewUrl) : null;
      let fallbackBlob = sourceBlob;
      if (!fallbackBlob && previewUrl) {
        fallbackBlob = await fetch(previewUrl)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
      }

      for (let i = 0; i < queue.length; i++) {
        const { item, idx } = queue[i];
        setImportProgressText(`正在入库第 ${i + 1} / ${queue.length} 题（生成提示与举一反三）…`);

        let itemBlob: Blob | null = null;
        if (loadedImg && item.box_2d) {
          itemBlob = await cropBoxToJpeg(loadedImg, item.box_2d, 0.04, 0.9);
        }
        if (!itemBlob && loadedImg) {
          itemBlob = await cropBoxToJpeg(loadedImg, [0, 0, 1000, 1000], 0, 0.88);
        }
        if (!itemBlob) {
          itemBlob = fallbackBlob;
        }
        if (!itemBlob) {
          setImportErrors((prev) => ({ ...prev, [idx]: "无法读取题图，请重新选择照片" }));
          continue;
        }

        const fd = new FormData();
        const ext = itemBlob.type === "image/png" ? "png" : "jpg";
        fd.append("image", itemBlob, `homework-item-${item.index || idx + 1}.${ext}`);
        if (grade !== null) fd.append("grade", String(grade));
        if (term) fd.append("term", term);
        if (source.trim()) fd.append("source", source.trim());
        if (note.trim()) fd.append("note", note.trim());
        fd.append("checkedItem", JSON.stringify(item));

        try {
          const res = await apiFetch("/api/mistakes", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
          if (!res.ok || !data.id) {
            throw new Error(data.error ?? "入库失败");
          }
          const createdId = data.id;
          setImportedByIdx((prev) => ({ ...prev, [idx]: createdId }));
          setImportOrder((prev) => (prev.includes(createdId) ? prev : [...prev, createdId]));
        } catch (err) {
          setImportErrors((prev) => ({
            ...prev,
            [idx]: err instanceof Error ? err.message : "入库出错，请重试",
          }));
        }
      }
    } finally {
      setImporting(false);
      setImportProgressText("");
    }
  }

  const activeStageIndex = CHECK_STAGES.reduce((acc, s, idx) => (elapsedSec >= s.atSec ? idx : acc), 0);
  const activeStageLabel = CHECK_STAGES[activeStageIndex]?.label ?? CHECK_STAGES[0].label;

  const pendingImportCount = result
    ? result.items.filter((_, idx) => selectedIndices.has(idx) && !importedByIdx[idx]).length
    : 0;
  const totalSelectedCount = selectedIndices.size;
  const importedCount = Object.keys(importedByIdx).length;
  const firstImportedId = importOrder[0] ?? Object.values(importedByIdx)[0] ?? null;

  const wrongOrBlankItems = result
    ? result.items.map((item, idx) => ({ item, idx })).filter(({ item }) => item.verdict !== "CORRECT")
    : [];
  const correctItems = result
    ? result.items.map((item, idx) => ({ item, idx })).filter(({ item }) => item.verdict === "CORRECT")
    : [];

  return (
    <div className="space-y-4">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="hidden"
        onChange={onPickWorksheet}
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={onPickWorksheet}
      />

      {/* Step 1: Empty upload state */}
      {!previewUrl && !result && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={phase === "decoding" || sampleLoading}
              className="card flex flex-col items-center gap-2 py-9 text-sprout-700 transition hover:bg-sprout-50"
            >
              <span className="text-4xl">📷</span>
              <span className="font-semibold">拍整页作业</span>
              <span className="text-xs text-slate-400">对准整页口算 / 练习册 / 单元卷竖拍</span>
            </button>

            <button
              type="button"
              onClick={() => albumInputRef.current?.click()}
              disabled={phase === "decoding" || sampleLoading}
              className="card flex flex-col items-center gap-2 py-9 text-slate-700 transition hover:bg-sprout-50"
            >
              <span className="text-4xl">🖼️</span>
              <span className="font-semibold">从相册/微信选卷子</span>
              <span className="text-xs text-slate-400">自动保持 2000px 高清字迹不模糊</span>
            </button>
          </div>

          {/* Instant zero-Gemini sample button */}
          <div className="card flex flex-col items-start justify-between gap-3 border border-dashed border-sprout-500/40 bg-sprout-50/40 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-slate-800">手边暂时没有作业纸？</div>
              <div className="mt-0.5 text-xs text-slate-500">
                秒级载入一份三年级随堂练习卷，体验 AI 逐题批改框选 + 错题一键切图入库。
              </div>
            </div>
            <button
              type="button"
              onClick={loadSampleCheck}
              disabled={sampleLoading || phase === "decoding"}
              className="btn-ghost w-full shrink-0 text-sm sm:w-auto"
            >
              {sampleLoading ? "正在载入示例…" : "✨ 试试整页批改示例"}
            </button>
          </div>
        </div>
      )}

      {/* Optional Metadata Bar (available before & after check; auto-filled after check) */}
      <MetadataBar
        grade={grade}
        setGrade={setGrade}
        term={term}
        setTerm={setTerm}
        source={source}
        setSource={setSource}
        note={note}
        setNote={setNote}
        disabled={phase === "checking" || importing}
        sourcePlaceholder="来源（如：三下第四单元小测）"
        notePlaceholder="备注（可选，如：本页要求估算 / 列式计算）"
        detectedHint={Boolean(result)}
      />

      {phase === "decoding" && (
        <div className="card py-6 text-center text-sm text-slate-500">正在优化高清作业照片…</div>
      )}

      {/* Pre-check Preview Card (photo selected, not yet checked) */}
      {previewUrl && !result && (
        <section className="card space-y-3">
          <div className="flex justify-center rounded-xl bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="整页作业预览"
              className="block max-h-[56vh] w-auto max-w-full rounded-lg"
            />
          </div>

          {phase === "checking" && (
            <div className="space-y-2.5 rounded-xl bg-sprout-50 p-3.5 text-xs text-sprout-700">
              <div className="flex items-center justify-between font-semibold">
                <span>✨ {activeStageLabel}</span>
                <span className="tabular-nums">{elapsedSec}s</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {CHECK_STAGES.map((st, idx) => (
                  <div
                    key={st.short}
                    className={`rounded-lg px-2 py-1 text-center text-[11px] font-medium transition ${
                      idx <= activeStageIndex
                        ? "bg-sprout-600 text-white"
                        : "bg-white/80 text-slate-400"
                    }`}
                  >
                    {st.short}
                  </div>
                ))}
              </div>
              <div className="text-slate-500">AI 正在逐题识字并用确定性算式二次核验答案，预计需 12–22 秒。</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={phase === "checking"}
            >
              重拍
            </button>
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => albumInputRef.current?.click()}
              disabled={phase === "checking"}
            >
              换张卷子
            </button>
            <button
              type="button"
              className="btn-primary w-full sm:flex-[2]"
              onClick={runHomeworkCheck}
              disabled={phase === "checking" || !sourceBlob}
            >
              {phase === "checking" ? `逐题批改中（${elapsedSec}s）…` : "📝 开始整页逐题批改"}
            </button>
          </div>
        </section>
      )}

      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}

      {/* Checked Result: Scorecard + Annotated Worksheet + Problem-by-Problem List */}
      {result && (
        <div className="space-y-4">
          {/* Scorecard Banner */}
          <section className="card space-y-3 border-l-4 border-sprout-500">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">📊 整页批改报告</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  共 {result.summary.total} 题
                </span>
              </div>
              <button
                type="button"
                onClick={resetSheet}
                disabled={importing}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-sprout-700 hover:bg-sprout-50 disabled:opacity-50"
              >
                🔄 换一张作业批改
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 px-2 py-2">
                <div className="text-[11px] text-slate-500">总题数</div>
                <div className="text-lg font-bold text-slate-800">{result.summary.total}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 px-2 py-2">
                <div className="text-[11px] text-emerald-700">✅ 做对</div>
                <div className="text-lg font-bold text-emerald-700">{result.summary.correct}</div>
              </div>
              <div className="rounded-xl bg-rose-50 px-2 py-2">
                <div className="text-[11px] text-rose-700">❌ 做错</div>
                <div className="text-lg font-bold text-rose-700">{result.summary.wrong}</div>
              </div>
              <div className="rounded-xl bg-amber-50 px-2 py-2">
                <div className="text-[11px] text-amber-700">⚪ 未作答</div>
                <div className="text-lg font-bold text-amber-700">{result.summary.blank}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">本页正确率</span>
                <span className="font-bold text-sprout-700">{result.summary.accuracy}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sprout-500 to-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, result.summary.accuracy))}%` }}
                />
              </div>
            </div>

            {result.summary.encouragement && (
              <div className="rounded-xl bg-sprout-50 px-3 py-2 text-xs leading-relaxed text-sprout-700">
                🌱 {result.summary.encouragement}
              </div>
            )}
          </section>

          {/* Interactive Annotated Worksheet Preview */}
          {previewUrl && (
            <section className="card space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">🖼️ 试卷原图批注（点击题框可定位题目）</h3>
                <span className="text-[11px] text-slate-400">绿框做对 · 红框做错 · 黄框未答</span>
              </div>
              <div className="flex justify-center overflow-hidden rounded-xl bg-slate-50 p-2">
                <div className="relative inline-block max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="批改标注预览"
                    className="block max-h-[66vh] w-auto max-w-full select-none rounded-lg"
                  />
                  {result.items.map((item, idx) => {
                    if (!item.box_2d) return null;
                    const [ymin, xmin, ymax, xmax] = item.box_2d;
                    const top = Math.max(0, Math.min(98, ymin / 10));
                    const left = Math.max(0, Math.min(98, xmin / 10));
                    const width = Math.max(4, Math.min(100 - left, (xmax - xmin) / 10));
                    const height = Math.max(4, Math.min(100 - top, (ymax - ymin) / 10));
                    const vStyle = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.WRONG;
                    const isFocused = activeIdx === idx;

                    return (
                      <button
                        key={`${item.index}-${idx}`}
                        type="button"
                        onClick={() => focusProblemFromOverlay(idx, item.verdict)}
                        style={{
                          top: `${top}%`,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                        }}
                        aria-label={`定位第 ${item.index} 题（${vStyle.text}）`}
                        className={`absolute rounded-md border-2 text-left transition ${
                          isFocused ? vStyle.boxActiveCls : vStyle.boxCls
                        }`}
                      >
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-br-md rounded-tl-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm ${vStyle.tagCls}`}
                        >
                          {vStyle.icon} #{item.index}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Problem-by-Problem Review List & Batch Import */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">
                  📋 逐题核对与错题入库（已勾选 {totalSelectedCount} 题）
                </h3>
                <div className="text-xs text-slate-400">
                  做错与未答题已默认勾选；入库时会自动裁剪单题原图并生成启发提示与 3 道变式。
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set<number>();
                    result.items.forEach((it, idx) => {
                      if (it.verdict !== "CORRECT") next.add(idx);
                    });
                    setSelectedIndices(next);
                  }}
                  className="text-sprout-700 hover:underline"
                >
                  仅选错题/未答
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedIndices(new Set())}
                  className="text-slate-500 hover:underline"
                >
                  清空勾选
                </button>
              </div>
            </div>

            {/* Wrong & Blank Items (always prominently expanded) */}
            {wrongOrBlankItems.map(({ item, idx }) => (
              <ProblemReviewCard
                key={`wb-${idx}`}
                item={item}
                checked={selectedIndices.has(idx)}
                active={activeIdx === idx}
                importedId={importedByIdx[idx]}
                importError={importErrors[idx]}
                disabled={importing}
                onToggleCheck={() => toggleSelect(idx)}
                onFocus={() => setActiveIdx(idx)}
                cardRef={(el) => {
                  cardRefs.current[idx] = el;
                }}
              />
            ))}

            {/* Correct Items (collapsible section so parent can review or still check for extra variants) */}
            {correctItems.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCorrectDetails((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl bg-emerald-50/70 px-3.5 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/70 transition hover:bg-emerald-50"
                >
                  <span>
                    ✅ 做对的 {correctItems.length} 道题（可点击展开核对，或勾选继续生成变式巩固）
                  </span>
                  <span>{showCorrectDetails ? "收起 ▲" : "展开 ▼"}</span>
                </button>

                {showCorrectDetails &&
                  correctItems.map(({ item, idx }) => (
                    <ProblemReviewCard
                      key={`ok-${idx}`}
                      item={item}
                      checked={selectedIndices.has(idx)}
                      active={activeIdx === idx}
                      importedId={importedByIdx[idx]}
                      importError={importErrors[idx]}
                      disabled={importing}
                      onToggleCheck={() => toggleSelect(idx)}
                      onFocus={() => setActiveIdx(idx)}
                      cardRef={(el) => {
                        cardRefs.current[idx] = el;
                      }}
                    />
                  ))}
              </div>
            )}

            {/* Batch Import Progress */}
            {importing && importProgressText && (
              <div className="rounded-xl bg-sprout-50 p-3.5 text-xs font-semibold text-sprout-700 ring-1 ring-sprout-500/20">
                ✨ {importProgressText}
              </div>
            )}

            {/* Completion Banner */}
            {!importing && importedCount > 0 && (
              <div className="card space-y-3 border-2 border-sprout-500/40 bg-sprout-50/60">
                <div className="text-sm font-bold text-sprout-700">
                  🎉 已成功将 {importedCount} 道题收入错题本！每道题均已配好三步启发提示与举一反三变式题。
                </div>
                <div className="flex flex-wrap gap-2">
                  {firstImportedId && (
                    <Link href={`/mistakes/${firstImportedId}`} className="btn-primary text-sm">
                      🚀 打开第 1 道新错题闯关 →
                    </Link>
                  )}
                  <Link href="/mistakes" className="btn-ghost text-sm">
                    📚 前往错题库查看全部
                  </Link>
                </div>
              </div>
            )}

            {/* Primary Batch Import CTA */}
            <button
              type="button"
              onClick={importSelectedMistakes}
              disabled={importing || pendingImportCount === 0}
              className="btn-primary w-full shadow-sm"
            >
              {importing
                ? importProgressText || "正在逐题生成启发提示与举一反三…"
                : pendingImportCount > 0
                  ? `📥 将选中的 ${pendingImportCount} 道题收入错题本（生成启发提示与举一反三）`
                  : importedCount > 0
                    ? "✅ 所选题目已全部收入错题本"
                    : "📥 请先勾选要收入错题本的题目"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function ProblemReviewCard({
  item,
  checked,
  active,
  importedId,
  importError,
  disabled,
  onToggleCheck,
  onFocus,
  cardRef,
}: {
  item: CheckedProblemItem;
  checked: boolean;
  active: boolean;
  importedId?: string;
  importError?: string;
  disabled: boolean;
  onToggleCheck: () => void;
  onFocus: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const vStyle = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.WRONG;

  return (
    <div
      ref={cardRef}
      onClick={onFocus}
      className={`rounded-2xl border p-3.5 shadow-sm transition ${vStyle.cardBorderCls} ${
        active ? "ring-2 ring-sprout-500" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || Boolean(importedId)}
          onChange={(e) => {
            e.stopPropagation();
            onToggleCheck();
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`选择第 ${item.index} 题收入错题本`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-sprout-600 focus:ring-sprout-500 disabled:cursor-default"
        />

        <div className="min-w-0 flex-1 space-y-2">
          {/* Header Row */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-800">#{item.index}</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${vStyle.pillCls}`}>
              {vStyle.icon} {vStyle.text}
            </span>
            {item.error_category && item.verdict !== "CORRECT" && (
              <ErrorBadge category={item.error_category} />
            )}
            {item.category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{item.category}</span>
            )}
            {importedId && (
              <Link
                href={`/mistakes/${importedId}`}
                onClick={(e) => e.stopPropagation()}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-sprout-100 px-2.5 py-0.5 font-semibold text-sprout-700 hover:bg-sprout-500 hover:text-white"
              >
                ✅ 已入库 → 查看详情
              </Link>
            )}
          </div>

          {/* Stem */}
          <MathText className="text-[15px] text-slate-800">{item.stem_text}</MathText>

          {/* Student Answer vs Correct Answer */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50/90 px-3 py-2 text-xs">
            <div>
              <span className="text-slate-500">孩子作答：</span>
              {item.student_answer.trim() ? (
                <MathText
                  inline
                  className={
                    item.verdict === "CORRECT"
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-rose-700"
                  }
                >
                  {item.student_answer}
                </MathText>
              ) : (
                <span className="font-medium text-amber-700">（未作答）</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">正确答案：</span>
              <MathText inline className="font-semibold text-slate-800">
                {item.correct_answer || "—"}
              </MathText>
            </div>
          </div>

          {/* Brief Feedback */}
          {item.brief_feedback && (
            <div className="text-xs leading-relaxed text-slate-600">
              <MathText className="text-xs text-slate-600">{item.brief_feedback}</MathText>
            </div>
          )}

          {/* Knowledge Points */}
          {item.knowledge_points?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.error_category && item.verdict !== "CORRECT" && (
                <span className="sr-only">{ERROR_LABELS[item.error_category] ?? item.error_category}</span>
              )}
              {item.knowledge_points.map((kp) => (
                <span key={kp} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  #{kp}
                </span>
              ))}
            </div>
          )}

          {importError && <div className="text-xs text-rose-600">入库失败：{importError}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Single-problem direct capture (`🔍 单题直接录错`) with compact Grade (1–6) & Term selector pills.
 */
function SingleProblemCapture() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"idle" | "decoding" | "uploading" | "done" | "error">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(preview);
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
        revokeIfBlobUrl(prev);
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
    if (grade !== null) fd.append("grade", String(grade));
    if (term) fd.append("term", term);
    if (source.trim()) fd.append("source", source.trim());
    if (note.trim()) fd.append("note", note.trim());

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
    [...SINGLE_STAGES].reverse().find((s) => elapsedSec >= s.atSec)?.label ?? SINGLE_STAGES[0].label;

  return (
    <div className="space-y-4">
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

      {!preview && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={phase === "decoding"}
            className="card flex flex-col items-center gap-2 py-9 text-sprout-700 transition hover:bg-sprout-50"
          >
            <span className="text-4xl">📷</span>
            <span className="font-semibold">直接拍单道错题</span>
            <span className="text-xs text-slate-400">尽量包含孩子的手写步骤与红笔痕迹</span>
          </button>

          <button
            type="button"
            onClick={() => albumInputRef.current?.click()}
            disabled={phase === "decoding"}
            className="card flex flex-col items-center gap-2 py-9 text-slate-700 transition hover:bg-sprout-50"
          >
            <span className="text-4xl">🖼️</span>
            <span className="font-semibold">从相册 / 微信选图</span>
            <span className="text-xs text-slate-400">支持截图或老师发在群里的单题特写</span>
          </button>
        </div>
      )}

      {/* Compact Grade + Term + Source + Note Metadata Bar */}
      <MetadataBar
        grade={grade}
        setGrade={setGrade}
        term={term}
        setTerm={setTerm}
        source={source}
        setSource={setSource}
        note={note}
        setNote={setNote}
        disabled={phase === "uploading"}
        sourcePlaceholder="来源（可选）：如 三下期中卷 / 周末练习"
        notePlaceholder="给 AI 的备注（可选）：如 孩子说没看懂“比…多几倍”"
      />

      {phase === "decoding" && (
        <div className="card py-6 text-center text-sm text-slate-500">正在处理图片…</div>
      )}

      {preview && (
        <div className="card space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="错题预览" className="max-h-[48vh] w-full rounded-xl bg-slate-50 object-contain" />

          {phase === "uploading" && (
            <div className="rounded-xl bg-sprout-50 p-3 text-xs text-sprout-700">
              <div className="flex items-center justify-between font-semibold">
                <span>✨ {activeStage}</span>
                <span>{elapsedSec}s</span>
              </div>
              <div className="mt-1 text-slate-500">
                预计需要 15–20 秒完成审题、错因定位与变式验算，请勿关闭页面。
              </div>
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
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}
    </div>
  );
}

function MetadataBar({
  grade,
  setGrade,
  term,
  setTerm,
  source,
  setSource,
  note,
  setNote,
  disabled,
  sourcePlaceholder,
  notePlaceholder,
  detectedHint = false,
}: {
  grade: number | null;
  setGrade: (g: number | null) => void;
  term: Term | null;
  setTerm: (t: Term | null) => void;
  source: string;
  setSource: (s: string) => void;
  note: string;
  setNote: (n: string) => void;
  disabled: boolean;
  sourcePlaceholder: string;
  notePlaceholder: string;
  detectedHint?: boolean;
}) {
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="font-semibold text-slate-700">🏷️ 年级、学期与来源（可选，未选时由 AI 自动识别）</span>
        {detectedHint && <span className="text-sprout-700">已自动填入识别信息，入库前可随时微调</span>}
      </div>

      {/* Grade & Term Selector Pills */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs text-slate-500">年级：</span>
          {GRADES.map((g) => {
            const active = grade === g;
            return (
              <button
                key={g}
                type="button"
                disabled={disabled}
                onClick={() => setGrade(active ? null : g)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-sprout-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-sprout-50 hover:text-sprout-700"
                }`}
              >
                {g}年级
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs text-slate-500">学期：</span>
          {TERMS.map((t) => {
            const active = term === t;
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => setTerm(active ? null : t)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-sprout-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-sprout-50 hover:text-sprout-700"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={disabled}
          placeholder={sourcePlaceholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sprout-500 focus:outline-none"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled}
          placeholder={notePlaceholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sprout-500 focus:outline-none"
        />
      </div>
    </section>
  );
}

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Crops `[ymin, xmin, ymax, xmax]` (0..1000 normalized coordinates) with `padRatio` (~4%)
 * clamped to image bounds into a crisp JPEG Blob via HTML5 `<canvas>`.
 */
function cropBoxToJpeg(
  img: HTMLImageElement,
  box2d: [number, number, number, number],
  padRatio = 0.04,
  quality = 0.9,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      if (!natW || !natH) {
        resolve(null);
        return;
      }
      const pad = Math.round(padRatio * 1000);
      const [ymin, xmin, ymax, xmax] = box2d;
      const y0 = Math.max(0, Math.min(1000, ymin - pad));
      const x0 = Math.max(0, Math.min(1000, xmin - pad));
      const y1 = Math.max(0, Math.min(1000, ymax + pad));
      const x1 = Math.max(0, Math.min(1000, xmax + pad));

      const sx = Math.max(0, Math.floor((x0 / 1000) * natW));
      const sy = Math.max(0, Math.floor((y0 / 1000) * natH));
      const sw = Math.min(natW - sx, Math.ceil(((x1 - x0) / 1000) * natW));
      const sh = Math.min(natH - sy, Math.ceil(((y1 - y0) / 1000) * natH));
      if (sw < 16 || sh < 16) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
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
      if (scale === 1 && file.type === "image/jpeg" && file.size <= 2_200_000) {
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
