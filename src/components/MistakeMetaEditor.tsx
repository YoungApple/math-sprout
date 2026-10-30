"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";
import type { ErrorCategory } from "@/lib/gemini";
import {
  GRADES,
  MATH_DOMAINS,
  TERMS,
  normalizeCategory,
  normalizeTerm,
  type MathDomain,
  type Term,
} from "@/lib/taxonomy";
import { ERROR_CATEGORIES, ERROR_META } from "./StatusBadge";

export function MistakeMetaEditor({
  mistakeId,
  initialGrade,
  initialTerm,
  initialErrorCategory,
  initialCategory,
  initialSource,
}: {
  mistakeId: string;
  initialGrade: number | null;
  initialTerm: string | null;
  initialErrorCategory: string;
  initialCategory: string | null;
  initialSource: string | null;
}) {
  const router = useRouter();
  const parsedCat = normalizeCategory(initialCategory);

  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<number | null>(initialGrade);
  const [term, setTerm] = useState<Term | null>(normalizeTerm(initialTerm));
  const [errorCategory, setErrorCategory] = useState<ErrorCategory>(
    ERROR_CATEGORIES.includes(initialErrorCategory as ErrorCategory)
      ? (initialErrorCategory as ErrorCategory)
      : "EXECUTION_ERROR",
  );
  const [domain, setDomain] = useState<MathDomain>(parsedCat.domain);
  const [topic, setTopic] = useState<string>(parsedCat.topic);
  const [source, setSource] = useState<string>(initialSource ?? "");

  const [busy, setBusy] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextCat = normalizeCategory(initialCategory);
    setGrade(initialGrade);
    setTerm(normalizeTerm(initialTerm));
    if (ERROR_CATEGORIES.includes(initialErrorCategory as ErrorCategory)) {
      setErrorCategory(initialErrorCategory as ErrorCategory);
    }
    setDomain(nextCat.domain);
    setTopic(nextCat.topic);
    setSource(initialSource ?? "");
  }, [initialGrade, initialTerm, initialErrorCategory, initialCategory, initialSource]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSavedToast(false);

    const cleanTopic = topic.trim() || "综合练习";
    const composedCategory = `${domain}/${cleanTopic}`;

    try {
      const res = await apiFetch(`/api/mistakes/${mistakeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grade,
          term,
          errorCategory,
          category: composedCategory,
          source: source.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "保存分类失败");
      }
      setSavedToast(true);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSavedToast(false);
            setError("");
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-sprout-50 hover:text-sprout-700"
        >
          <span>🏷️ 调整分类/来源</span>
          <span className="text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
        </button>
        {savedToast && <span className="text-xs font-medium text-sprout-700">✅ 分类与来源已更新</span>}
      </div>

      {open && (
        <form onSubmit={save} className="card space-y-3 border border-sprout-100 bg-white">
          <div className="text-xs font-semibold text-slate-700">调整题目归档维度（保存后立即同步错题库筛选）</div>

          {/* Grade */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs text-slate-500">年级：</span>
            {GRADES.map((g) => {
              const active = grade === g;
              return (
                <button
                  key={g}
                  type="button"
                  disabled={busy}
                  onClick={() => setGrade(active ? null : g)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    active ? "bg-sprout-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                  }`}
                >
                  {g}年级
                </button>
              );
            })}
          </div>

          {/* Term */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs text-slate-500">学期：</span>
            {TERMS.map((t) => {
              const active = term === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  onClick={() => setTerm(active ? null : t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? "bg-sprout-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Error Category */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs text-slate-500">错因：</span>
            {ERROR_CATEGORIES.map((ec) => {
              const meta = ERROR_META[ec];
              const active = errorCategory === ec;
              return (
                <button
                  key={ec}
                  type="button"
                  disabled={busy}
                  onClick={() => setErrorCategory(ec)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    active ? "bg-sprout-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>

          {/* Domain + Sub-topic */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 shrink-0 text-xs text-slate-500">领域：</span>
              {MATH_DOMAINS.map((dom) => {
                const active = domain === dom;
                return (
                  <button
                    key={dom}
                    type="button"
                    disabled={busy}
                    onClick={() => setDomain(dom)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      active ? "bg-sprout-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                    }`}
                  >
                    {dom}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">题型细分（将归档为「{domain}/…」）</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={busy}
                  placeholder="如：有余数的除法 / 长方形周长"
                  className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-sprout-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">试卷/作业来源</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={busy}
                  placeholder="如：三下第四单元小测"
                  className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-sprout-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && <div className="text-xs text-rose-600">{error}</div>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sprout-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sprout-700 disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存分类"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
