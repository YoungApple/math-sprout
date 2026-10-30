"use client";

import { useState } from "react";
import { MathText } from "./MathText";

/**
 * Socratic scaffolding: optional sandboxed visual diagram + progressive 1-by-1 hints.
 * Original answer stays hidden behind explicit steps so the child thinks first.
 */
export function HintStepper({
  hints,
  correctAnswer,
  svgDiagram,
}: {
  hints: string[];
  correctAnswer: string;
  svgDiagram?: string | null;
}) {
  const [shown, setShown] = useState(0);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [answerShown, setAnswerShown] = useState(false);

  const svgDataUri = svgDiagram ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDiagram)}` : null;

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-600">🧭 启发式闯关提示（先自己想一想）</h2>
        {hints.length > 0 && (
          <span className="text-xs text-slate-400">
            已展开 {shown}/{hints.length}
          </span>
        )}
      </div>

      {svgDataUri && (
        <div className="rounded-xl border border-sprout-100 bg-slate-50/70 p-3">
          <button
            type="button"
            onClick={() => setDiagramOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-sprout-700"
          >
            <span>📊 画个图帮你想一想（线段图 / 数量关系图）</span>
            <span>{diagramOpen ? "收起 ▲" : "展开 ▼"}</span>
          </button>
          {diagramOpen && (
            <div className="mt-2.5 overflow-x-auto rounded-lg bg-white p-2">
              {/* Native browser SVG-in-<img> sandbox: scripts/events inside SVG cannot execute */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgDataUri}
                alt="数量关系示意图"
                className="mx-auto block h-auto w-full max-w-[400px]"
              />
            </div>
          )}
        </div>
      )}

      {hints.slice(0, shown).map((h, i) => (
        <div key={i} className="rounded-xl bg-sprout-50 p-3">
          <div className="mb-1 text-xs font-semibold text-sprout-700">提示 {i + 1}</div>
          <MathText>{h}</MathText>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {shown < hints.length && (
          <button type="button" className="btn-ghost flex-1" onClick={() => setShown(shown + 1)}>
            💡 {shown === 0 ? "我需要第 1 个提示" : `再提示一点（${shown + 1}/${hints.length}）`}
          </button>
        )}
        {shown >= hints.length && !answerShown && (
          <button type="button" className="btn-ghost flex-1" onClick={() => setAnswerShown(true)}>
            👀 核对原题答案
          </button>
        )}
      </div>

      {answerShown && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-semibold">原题正确答案：</span>
          <MathText inline>{correctAnswer}</MathText>
        </div>
      )}
    </section>
  );
}
