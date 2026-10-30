"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Attempt, Variant } from "@/lib/repo";
import {
  deriveProgress,
  formatDateZh,
  type ReviewProgress,
  type ReviewState,
} from "@/lib/review";
import { apiFetch } from "@/lib/client";
import { MathText } from "./MathText";
import { StatusBadge } from "./StatusBadge";

const LEVEL_LABELS: Record<string, { title: string; desc: string }> = {
  L1: { title: "L1 · 换个数字", desc: "题目结构一样，只换了数字" },
  L2: { title: "L2 · 换个场景", desc: "数量关系一样，换成生活里的故事" },
  L3: { title: "L3 · 进阶挑战", desc: "逆向思考或多一步推理，真正吃透方法" },
};

const QUICK_MATH_KEYS: { label: string; insert: string; hint: string }[] = [
  { label: "/ 分数", insert: "/", hint: "如 3/4" },
  { label: "…… 余", insert: "……", hint: "如 5……3" },
  { label: ": 比", insert: ":", hint: "如 3:4" },
  { label: "%", insert: "%", hint: "百分号" },
  { label: "又", insert: "又", hint: "如 1又1/2" },
];

type AttemptResponse = {
  isCorrect: boolean;
  attemptCountOnVariant: number;
  expected: string;
  explanation: string;
  review: ReviewState;
  progress: ReviewProgress;
};

/**
 * L1–L3 variant quiz:
 * - Active-round scoped (`progress.solvedVariantIds`), unlocking inputs on due Ebbinghaus reviews.
 * - Full math symbol entry on phones (`inputMode="text"` + 1-tap math operator chips).
 * - Pedagogical 2-try flow: 1st wrong answer nudges retry without spoiling expected answer.
 */
export function VariantQuiz({
  mistakeId,
  variants,
  attempts = [],
  initialReview,
  initialProgress,
  nextDueMistakeId = null,
}: {
  mistakeId: string;
  variants: Variant[];
  attempts?: Attempt[];
  initialReview: ReviewState;
  initialProgress?: ReviewProgress;
  nextDueMistakeId?: string | null;
}) {
  const router = useRouter();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, AttemptResponse>>({});
  const [revealedExplanation, setRevealedExplanation] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReviewState>(initialReview);
  const [progress, setProgress] = useState<ReviewProgress>(
    () => initialProgress ?? deriveProgress(initialReview, variants, attempts),
  );

  const solvedInActiveRound = new Set(progress.solvedVariantIds);
  const roundCompleted = review.status === "MASTERED" && !progress.isDue;

  function insertSymbol(variantId: string, token: string) {
    const el = inputRefs.current[variantId];
    const current = answers[variantId] ?? "";
    if (!el) {
      setAnswers((a) => ({ ...a, [variantId]: current + token }));
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const nextVal = current.slice(0, start) + token + current.slice(end);
    setAnswers((a) => ({ ...a, [variantId]: nextVal }));
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function submit(v: Variant) {
    const answer = (answers[v.id] ?? "").trim();
    if (!answer) return;
    setBusy(v.id);
    setErrorMsg((e) => ({ ...e, [v.id]: "" }));
    try {
      const res = await apiFetch(`/api/mistakes/${mistakeId}/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: v.id, answer }),
      });
      const data = (await res.json().catch(() => null)) as (AttemptResponse & { error?: string }) | null;
      if (!res.ok || !data) {
        setErrorMsg((e) => ({ ...e, [v.id]: data?.error ?? "提交失败，请重试" }));
        return;
      }
      setResults((r) => ({ ...r, [v.id]: data }));
      setReview(data.review);
      if (data.progress) setProgress(data.progress);
      router.refresh();
    } catch {
      setErrorMsg((e) => ({ ...e, [v.id]: "网络异常，请稍后再试" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-700">🎯 举一反三 · 闯关小测验</h2>
          <p className="text-xs text-slate-400">
            本轮进度：{roundCompleted ? variants.length : progress.solvedCount}/{variants.length} 题（独立答对全部 3 题即通关）
          </p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {progress.isScheduledReview && (
        <div className="rounded-2xl border border-sprout-500/30 bg-sprout-50 p-3.5 text-sm text-sprout-700">
          <div className="font-semibold">🔄 第 {review.stage} 阶段艾宾浩斯复习时间到！</div>
          <p className="mt-0.5 text-xs text-slate-600">
            重新独立通关下面 3 道变式题，把短期记忆升级为更稳固的长期记忆吧。
          </p>
        </div>
      )}

      {variants.map((v) => {
        const r = results[v.id];
        const done = roundCompleted || Boolean(r?.isCorrect) || solvedInActiveRound.has(v.id);
        const meta = LEVEL_LABELS[v.level] ?? { title: v.level, desc: "" };
        const attemptsSoFar = r?.attemptCountOnVariant ?? progress.attemptCountsByVariant[v.id] ?? 0;
        const shouldRevealAnswer = Boolean(r && !r.isCorrect && (attemptsSoFar >= 2 || revealedExplanation[v.id]));

        return (
          <div key={v.id} className={`card space-y-3 ${done ? "bg-sprout-50/40 ring-sprout-500/30" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-sprout-700">
                  {meta.title} {done && "✅"}
                </div>
                <div className="text-xs text-slate-400">{meta.desc}</div>
              </div>
              {done && <span className="rounded-full bg-sprout-100 px-2 py-0.5 text-xs font-medium text-sprout-700">本轮已通关</span>}
            </div>

            <MathText className="text-[16px]">{v.stem}</MathText>

            {!done && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(v);
                }}
              >
                <div className="flex gap-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[v.id] = el;
                    }}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={answers[v.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [v.id]: e.target.value }))}
                    placeholder="输入答案（如 30、3/4、5……3）"
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-base focus:border-sprout-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="btn-primary shrink-0 px-5"
                    disabled={busy === v.id || !(answers[v.id] ?? "").trim()}
                  >
                    {busy === v.id ? "判题中…" : "提交"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400">快捷符号：</span>
                  {QUICK_MATH_KEYS.map((k) => (
                    <button
                      key={k.label}
                      type="button"
                      title={k.hint}
                      onClick={() => insertSymbol(v.id, k.insert)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-sprout-50 hover:text-sprout-700 active:scale-95"
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </form>
            )}

            {errorMsg[v.id] && <p className="text-xs text-rose-600">{errorMsg[v.id]}</p>}

            {r && r.isCorrect && (
              <div className="rounded-xl bg-sprout-100/80 p-3 text-sm text-sprout-700">
                <div className="font-semibold">🎉 答对啦！思路非常清晰！</div>
                <MathText className="mt-1 text-slate-700">{r.explanation}</MathText>
              </div>
            )}

            {r && !r.isCorrect && !shouldRevealAnswer && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-semibold">🤔 差一点点！再检查一下数量关系或单位，再试一次吧～</div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-amber-700/90">
                  <span>提示：注意看清题目最后问的是“一共”、“还剩”还是“相差”哦</span>
                  <button
                    type="button"
                    onClick={() => setRevealedExplanation((prev) => ({ ...prev, [v.id]: true }))}
                    className="shrink-0 font-semibold underline hover:text-amber-900"
                  >
                    查看答案与解析
                  </button>
                </div>
              </div>
            )}

            {r && !r.isCorrect && shouldRevealAnswer && (
              <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                <div className="font-semibold">
                  再想想～ 正确答案是 <MathText inline>{r.expected}</MathText>
                </div>
                <MathText className="mt-1 text-slate-700">{r.explanation}</MathText>
              </div>
            )}
          </div>
        );
      })}

      {roundCompleted && (
        <div className="card space-y-3 bg-gradient-to-br from-sprout-600 to-emerald-500 text-white ring-0">
          <div className="text-base font-bold">🌱 太棒啦！这道错题本轮已成功攻克！</div>
          <p className="text-sm text-white/90">
            已进入艾宾浩斯第 {review.stage} 阶段，系统将在 {formatDateZh(review.nextReviewAt)} 安排下一次巩固复习。
          </p>
          <div className="flex flex-wrap gap-2">
            {nextDueMistakeId ? (
              <Link href={`/mistakes/${nextDueMistakeId}`} className="btn bg-white text-sprout-700">
                继续挑战下一道待复习 →
              </Link>
            ) : (
              <Link href="/" className="btn bg-white text-sprout-700">
                🎯 返回今日首页
              </Link>
            )}
            <Link href="/capture" className="btn bg-white/20 text-white ring-1 ring-white/40">
              📷 继续录新错题
            </Link>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        下次复习：{formatDateZh(review.nextReviewAt)} · 第 {review.stage} 阶段
      </p>
    </section>
  );
}
