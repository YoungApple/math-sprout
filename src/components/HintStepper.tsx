"use client";

import { useState } from "react";
import { MathText } from "./MathText";

/** Socratic scaffolding: reveal hints one at a time; the answer is the last resort. */
export function HintStepper({ hints, correctAnswer }: { hints: string[]; correctAnswer: string }) {
  const [shown, setShown] = useState(0);
  const [answerShown, setAnswerShown] = useState(false);
  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">启发式提示（先自己想一想）</h2>
      {hints.slice(0, shown).map((h, i) => (
        <div key={i} className="rounded-xl bg-sprout-50 p-3">
          <div className="mb-1 text-xs font-semibold text-sprout-700">提示 {i + 1}</div>
          <MathText>{h}</MathText>
        </div>
      ))}
      <div className="flex gap-2">
        {shown < hints.length && (
          <button className="btn-ghost flex-1" onClick={() => setShown(shown + 1)}>
            💡 {shown === 0 ? "我需要提示" : "再提示一点"}
          </button>
        )}
        {shown >= hints.length && !answerShown && (
          <button className="btn-ghost flex-1" onClick={() => setAnswerShown(true)}>看答案</button>
        )}
      </div>
      {answerShown && <MathText className="rounded-xl bg-amber-50 p-3">{`**答案：** ${correctAnswer}`}</MathText>}
    </section>
  );
}
