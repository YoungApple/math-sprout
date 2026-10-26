"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Attempt, Variant } from "@/lib/repo";
import type { ReviewState } from "@/lib/review";
import { apiFetch } from "@/lib/client";
import { MathText } from "./MathText";
import { StatusBadge } from "./StatusBadge";

const LEVEL_LABELS: Record<string, { title: string; desc: string }> = {
  L1: { title: "L1 · 换个数字", desc: "题目结构一样，只换了数字" },
  L2: { title: "L2 · 换个场景", desc: "数量关系一样，换成生活里的故事" },
  L3: { title: "L3 · 反过来想", desc: "已知和未知对调，挑战逆向思维" },
};

type Result = { isCorrect: boolean; expected: string; explanation: string; review: ReviewState };

/** 1-to-3 variant quiz: answer inline, instant grading, drives the mastery state machine. */
export function VariantQuiz({
  mistakeId, variants, attempts, initialReview,
}: { mistakeId: string; variants: Variant[]; attempts: Attempt[]; initialReview: ReviewState }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState(initialReview);

  const solvedBefore = new Set(attempts.filter((a) => a.isCorrect).map((a) => a.variantId));

  async function submit(v: Variant) {
    const answer = (answers[v.id] ?? "").trim();
    if (!answer) return;
    setBusy(v.id);
    try {
      const res = await apiFetch(`/api/mistakes/${mistakeId}/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: v.id, answer }),
      });
      const data = (await res.json()) as Result;
      if (res.ok) {
        setResults((r) => ({ ...r, [v.id]: data }));
        setReview(data.review);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">举一反三 · 小测验</h2>
        <StatusBadge status={review.status} />
      </div>
      {variants.map((v) => {
        const r = results[v.id];
        const done = r?.isCorrect || solvedBefore.has(v.id);
        const meta = LEVEL_LABELS[v.level];
        return (
          <div key={v.id} className={`card space-y-3 ${done ? "ring-sprout-100 bg-sprout-50/40" : ""}`}>
            <div>
              <div className="text-sm font-semibold text-sprout-700">{meta.title} {done && "✅"}</div>
              <div className="text-xs text-slate-400">{meta.desc}</div>
            </div>
            <MathText className="text-[16px]">{v.stem}</MathText>
            {!done && (
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); submit(v); }}
              >
                <input
                  value={answers[v.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [v.id]: e.target.value }))}
                  placeholder="写下你的答案"
                  inputMode="decimal"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
                />
                <button type="submit" className="btn-primary" disabled={busy === v.id}>
                  {busy === v.id ? "…" : "提交"}
                </button>
              </form>
            )}
            {r && (
              <div className={`rounded-xl p-3 text-sm ${r.isCorrect ? "bg-sprout-100 text-sprout-700" : "bg-rose-50 text-rose-700"}`}>
                <div className="font-semibold">{r.isCorrect ? "🎉 答对啦！" : `再想想～ 正确答案是 ${r.expected}`}</div>
                <MathText className="mt-1 text-slate-700">{r.explanation}</MathText>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-center text-xs text-slate-400">
        下次复习：{new Date(review.nextReviewAt).toLocaleDateString("zh-CN")} · 第 {review.stage} 阶段
      </p>
    </section>
  );
}
