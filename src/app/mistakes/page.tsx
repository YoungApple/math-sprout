import Link from "next/link";
import type { ErrorCategory } from "@/lib/gemini";
import { getMistakeFacets, listMistakes } from "@/lib/repo";
import type { ReviewStatus } from "@/lib/review";
import {
  GRADES,
  MATH_DOMAINS,
  TERMS,
  type MathDomain,
  type Term,
} from "@/lib/taxonomy";
import { MistakeCard } from "@/components/MistakeCard";
import {
  ERROR_CATEGORIES,
  ERROR_META,
  STATUS_LABELS,
} from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReviewStatus[] = ["PENDING", "CONSOLIDATING", "RELAPSED", "MASTERED"];

const DOMAIN_ICONS: Record<MathDomain, string> = {
  数与代数: "🔢",
  图形与几何: "📐",
  统计与概率: "📊",
  综合与实践: "🧠",
};

interface FilterParams {
  status?: ReviewStatus;
  errorCategory?: ErrorCategory;
  domain?: MathDomain;
  category?: string;
  tag?: string;
  grade?: number;
  term?: Term;
  source?: string;
  q?: string;
}

export default async function MistakesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string): string | undefined => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s?.trim() || undefined;
  };

  const rawStatus = pick("status");
  const activeStatus = VALID_STATUSES.includes(rawStatus as ReviewStatus)
    ? (rawStatus as ReviewStatus)
    : undefined;

  const rawErrorCat = pick("errorCategory");
  const activeErrorCategory = ERROR_CATEGORIES.includes(rawErrorCat as ErrorCategory)
    ? (rawErrorCat as ErrorCategory)
    : undefined;

  const rawDomain = pick("domain");
  const activeDomain = MATH_DOMAINS.includes(rawDomain as MathDomain)
    ? (rawDomain as MathDomain)
    : undefined;

  const activeCategory = pick("category");
  const activeTag = pick("tag");

  const rawGrade = pick("grade");
  const parsedGrade = rawGrade ? Number(rawGrade) : NaN;
  const activeGrade =
    Number.isInteger(parsedGrade) && parsedGrade >= 1 && parsedGrade <= 6 ? parsedGrade : undefined;

  const rawTerm = pick("term");
  const activeTerm = TERMS.includes(rawTerm as Term) ? (rawTerm as Term) : undefined;

  const activeSource = pick("source");
  const activeQuery = pick("q");

  const currentFilters: FilterParams = {
    status: activeStatus,
    errorCategory: activeErrorCategory,
    domain: activeDomain,
    category: activeCategory,
    tag: activeTag,
    grade: activeGrade,
    term: activeTerm,
    source: activeSource,
    q: activeQuery,
  };

  const hasAnyFilter = Boolean(
    activeStatus ||
      activeErrorCategory ||
      activeDomain ||
      activeCategory ||
      activeTag ||
      activeGrade ||
      activeTerm ||
      activeSource ||
      activeQuery,
  );

  const [facets, items] = await Promise.all([
    getMistakeFacets(),
    listMistakes({
      ...currentFilters,
      limit: 200,
    }),
  ]);

  function buildFilterHref(patch: Partial<FilterParams>): string {
    const merged: FilterParams = { ...currentFilters, ...patch };
    const qs = new URLSearchParams();
    if (merged.status) qs.set("status", merged.status);
    if (merged.errorCategory) qs.set("errorCategory", merged.errorCategory);
    if (merged.domain) qs.set("domain", merged.domain);
    if (merged.category) qs.set("category", merged.category);
    if (merged.tag) qs.set("tag", merged.tag);
    if (merged.grade) qs.set("grade", String(merged.grade));
    if (merged.term) qs.set("term", merged.term);
    if (merged.source) qs.set("source", merged.source);
    if (merged.q) qs.set("q", merged.q);
    const str = qs.toString();
    return str ? `/mistakes?${str}` : "/mistakes";
  }

  const gradeCounts = new Map<number, number>(facets.grades.map((g) => [g.grade, g.count]));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">错题诊断库</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            累计 {facets.total} 题 · 待复习 {facets.due} 题 · 已掌握 {facets.mastered} 题
          </div>
        </div>
        <Link href="/capture?mode=check" className="btn-ghost px-3 py-1.5 text-xs">
          📝 批改新作业
        </Link>
      </div>

      {/* 1) 四大错因诊断分布卡 (4-Grid Error Root-Cause Cards) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500">
            🩺 四大错因诊断分布（点击卡片筛选对应错题）
          </h2>
          {activeErrorCategory && (
            <Link
              href={buildFilterHref({ errorCategory: undefined })}
              className="text-xs text-sprout-700 hover:underline"
            >
              取消错因筛选
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {ERROR_CATEGORIES.map((ec) => {
            const meta = ERROR_META[ec];
            const count = facets.byErrorCategory[ec] ?? 0;
            const sharePct = facets.total > 0 ? Math.round((count / facets.total) * 100) : 0;
            const selected = activeErrorCategory === ec;

            return (
              <Link
                key={ec}
                href={buildFilterHref({ errorCategory: selected ? undefined : ec })}
                className={`card flex flex-col justify-between space-y-2 p-3 transition hover:ring-sprout-500/40 ${
                  selected ? meta.cardActiveCls : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-800">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">{sharePct}%</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold text-slate-800">{count}</span>
                  <span className="text-[11px] text-slate-400">题</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${meta.barCls}`}
                    style={{ width: `${Math.min(100, sharePct)}%` }}
                  />
                </div>
                <div className="line-clamp-1 text-[11px] text-slate-400">{meta.desc}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 2) 课标四大领域 & 薄弱题型/知识点聚合卡 */}
      <section className="card space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-600">📚 课标四大领域与高频薄弱点</h2>
          {(activeDomain || activeCategory || activeTag) && (
            <Link
              href={buildFilterHref({ domain: undefined, category: undefined, tag: undefined })}
              className="text-xs text-sprout-700 hover:underline"
            >
              重置领域/知识点
            </Link>
          )}
        </div>

        {/* 4 Curriculum Domain Pills */}
        <div className="flex flex-wrap gap-2">
          {MATH_DOMAINS.map((dom) => {
            const count = facets.byDomain[dom] ?? 0;
            const selected = activeDomain === dom;
            return (
              <Link
                key={dom}
                href={buildFilterHref({ domain: selected ? undefined : dom })}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "bg-sprout-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 hover:bg-sprout-50 hover:text-sprout-700"
                }`}
              >
                <span>{DOMAIN_ICONS[dom]}</span>
                <span>{dom}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] ${
                    selected ? "bg-white/20 text-white" : "bg-white text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Top Weak Sub-Categories */}
        {facets.topCategories.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold text-slate-400">薄弱题型细分 Top {facets.topCategories.length}</div>
            <ul className="space-y-1">
              {facets.topCategories.map(({ category, count }) => {
                const selected = activeCategory === category;
                return (
                  <li key={category}>
                    <Link
                      href={buildFilterHref({ category: selected ? undefined : category })}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition ${
                        selected ? "bg-rose-50 font-semibold text-rose-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex-1 truncate">{category}</span>
                      <span
                        className="h-2 rounded-full bg-rose-400"
                        style={{
                          width: `${Math.max(8, Math.round((count / Math.max(1, facets.total)) * 120))}px`,
                        }}
                      />
                      <span className="w-7 text-right tabular-nums text-slate-500">{count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Knowledge Points Tag Cloud */}
        {facets.topTags.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold text-slate-400">高频 #知识点 标签云</div>
            <div className="flex flex-wrap gap-1.5">
              {facets.topTags.map(({ tag, count }) => {
                const selected = activeTag === tag;
                return (
                  <Link
                    key={tag}
                    href={buildFilterHref({ tag: selected ? undefined : tag })}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      selected
                        ? "bg-sprout-600 font-semibold text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-sprout-50 hover:text-sprout-700"
                    }`}
                  >
                    #{tag} <span className="opacity-70">({count})</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3) 组合筛选栏 + 搜索框 */}
      <section className="card space-y-3">
        {/* Search Form preserving active filters */}
        <form action="/mistakes" method="get" className="flex items-center gap-2">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          {activeErrorCategory && <input type="hidden" name="errorCategory" value={activeErrorCategory} />}
          {activeDomain && <input type="hidden" name="domain" value={activeDomain} />}
          {activeCategory && <input type="hidden" name="category" value={activeCategory} />}
          {activeTag && <input type="hidden" name="tag" value={activeTag} />}
          {activeGrade && <input type="hidden" name="grade" value={String(activeGrade)} />}
          {activeTerm && <input type="hidden" name="term" value={activeTerm} />}
          {activeSource && <input type="hidden" name="source" value={activeSource} />}

          <input
            type="search"
            name="q"
            defaultValue={activeQuery ?? ""}
            placeholder="搜索题干关键字、知识点或试卷名（如：周长、余数、期中）"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sprout-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-sprout-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sprout-700"
          >
            搜索
          </button>
          {activeQuery && (
            <Link
              href={buildFilterHref({ q: undefined })}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
            >
              清空
            </Link>
          )}
        </form>

        {/* Status Filter Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 shrink-0 text-[11px] text-slate-400">状态：</span>
          <Link
            href={buildFilterHref({ status: undefined })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              !activeStatus
                ? "bg-sprout-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
            }`}
          >
            全部
          </Link>
          {VALID_STATUSES.map((st) => {
            const selected = activeStatus === st;
            const cnt = facets.byStatus[st] ?? 0;
            return (
              <Link
                key={st}
                href={buildFilterHref({ status: selected ? undefined : st })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selected
                    ? "bg-sprout-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                }`}
              >
                {STATUS_LABELS[st].text} ({cnt})
              </Link>
            );
          })}
        </div>

        {/* Grade & Term Filter Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 shrink-0 text-[11px] text-slate-400">学段：</span>
          {GRADES.map((g) => {
            const selected = activeGrade === g;
            const cnt = gradeCounts.get(g) ?? 0;
            return (
              <Link
                key={g}
                href={buildFilterHref({ grade: selected ? undefined : g })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selected
                    ? "bg-sprout-600 text-white"
                    : cnt > 0
                      ? "bg-slate-100 text-slate-700 hover:bg-sprout-50"
                      : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                }`}
              >
                {g}年级{cnt > 0 ? ` (${cnt})` : ""}
              </Link>
            );
          })}
          <span className="mx-0.5 text-slate-200">|</span>
          {TERMS.map((t) => {
            const selected = activeTerm === t;
            return (
              <Link
                key={t}
                href={buildFilterHref({ term: selected ? undefined : t })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selected ? "bg-sprout-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-sprout-50"
                }`}
              >
                {t}
              </Link>
            );
          })}
        </div>

        {/* Source Filter Row (when sources exist) */}
        {facets.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 text-[11px] text-slate-400">来源：</span>
            {facets.sources.map(({ source, count }) => {
              const selected = activeSource === source;
              return (
                <Link
                  key={source}
                  href={buildFilterHref({ source: selected ? undefined : source })}
                  className={`max-w-[14rem] truncate rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    selected
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  📄 {source} ({count})
                </Link>
              );
            })}
          </div>
        )}

        {/* Active-Filter Summary Bar */}
        {hasAnyFilter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sprout-50/80 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-700">
              <span className="font-semibold text-sprout-700">
                当前命中 {items.length} / {facets.total} 题：
              </span>
              {activeStatus && (
                <Link
                  href={buildFilterHref({ status: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  状态：{STATUS_LABELS[activeStatus].text} ×
                </Link>
              )}
              {activeErrorCategory && (
                <Link
                  href={buildFilterHref({ errorCategory: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  错因：{ERROR_META[activeErrorCategory].label} ×
                </Link>
              )}
              {activeDomain && (
                <Link
                  href={buildFilterHref({ domain: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  领域：{activeDomain} ×
                </Link>
              )}
              {activeCategory && (
                <Link
                  href={buildFilterHref({ category: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  题型：{activeCategory} ×
                </Link>
              )}
              {activeTag && (
                <Link
                  href={buildFilterHref({ tag: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  #{activeTag} ×
                </Link>
              )}
              {activeGrade && (
                <Link
                  href={buildFilterHref({ grade: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  {activeGrade}年级 ×
                </Link>
              )}
              {activeTerm && (
                <Link
                  href={buildFilterHref({ term: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  {activeTerm} ×
                </Link>
              )}
              {activeSource && (
                <Link
                  href={buildFilterHref({ source: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  来源：{activeSource} ×
                </Link>
              )}
              {activeQuery && (
                <Link
                  href={buildFilterHref({ q: undefined })}
                  className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 hover:text-rose-600"
                >
                  搜“{activeQuery}” ×
                </Link>
              )}
            </div>
            <Link href="/mistakes" className="shrink-0 font-semibold text-sprout-700 hover:underline">
              清除全部筛选
            </Link>
          </div>
        )}
      </section>

      {/* Mistake List */}
      {items.length === 0 ? (
        <div className="card py-10 text-center text-sm text-slate-500">
          {facets.total === 0 ? (
            <div className="space-y-3">
              <p>还没有错题记录，拍一页作业或单道错题试试吧！</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/capture?mode=check" className="btn-primary inline-flex text-sm">
                  📝 拍整页作业批改
                </Link>
                <Link href="/capture?mode=single" className="btn-ghost inline-flex text-sm">
                  📷 单题录错
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p>当前组合筛选条件下没有匹配的错题。</p>
              <Link href="/mistakes" className="font-semibold text-sprout-700 underline">
                清除全部筛选，显示全部 {facets.total} 道错题
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <MistakeCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
