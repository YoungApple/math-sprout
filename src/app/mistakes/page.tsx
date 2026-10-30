import Link from "next/link";
import { listMistakes } from "@/lib/repo";
import type { ReviewStatus } from "@/lib/review";
import { MistakeCard } from "@/components/MistakeCard";
import { STATUS_LABELS } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReviewStatus[] = ["PENDING", "CONSOLIDATING", "RELAPSED", "MASTERED"];

export default async function MistakesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const activeStatus = VALID_STATUSES.includes(sp.status as ReviewStatus) ? (sp.status as ReviewStatus) : undefined;
  const activeCategory = sp.category?.trim() || undefined;

  const [allItems, filteredItems] = await Promise.all([
    listMistakes({ limit: 200 }),
    activeStatus || activeCategory
      ? listMistakes({ status: activeStatus, category: activeCategory, limit: 200 })
      : Promise.resolve(null),
  ]);
  const items = filteredItems ?? allItems;

  const byCategory = new Map<string, number>();
  for (const m of allItems) {
    const key = m.category || "未分类";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  function buildFilterHref(next: { status?: string; category?: string }): string {
    const q = new URLSearchParams();
    if (next.status) q.set("status", next.status);
    if (next.category) q.set("category", next.category);
    const qs = q.toString();
    return qs ? `/mistakes?${qs}` : "/mistakes";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">错题库</h1>
        <span className="text-xs text-slate-400">共 {allItems.length} 题</span>
      </div>

      {top.length > 0 && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">薄弱知识点 Top 5（点击可筛选）</h2>
            {activeCategory && (
              <Link href={buildFilterHref({ status: activeStatus })} className="text-xs text-sprout-700 hover:underline">
                清除分类筛选
              </Link>
            )}
          </div>
          <ul className="space-y-1.5">
            {top.map(([cat, n]) => {
              const selected = activeCategory === cat;
              return (
                <li key={cat}>
                  <Link
                    href={buildFilterHref({ status: activeStatus, category: selected ? undefined : cat })}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition ${
                      selected ? "bg-rose-50 font-semibold text-rose-700" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex-1 truncate">{cat}</span>
                    <span
                      className="h-2 rounded-full bg-rose-400"
                      style={{ width: `${Math.max(8, (n / Math.max(1, allItems.length)) * 140)}px` }}
                    />
                    <span className="w-8 text-right text-slate-500">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {allItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={buildFilterHref({ category: activeCategory })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !activeStatus ? "bg-sprout-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-sprout-50"
            }`}
          >
            全部状态
          </Link>
          {VALID_STATUSES.map((st) => {
            const selected = activeStatus === st;
            return (
              <Link
                key={st}
                href={buildFilterHref({ status: selected ? undefined : st, category: activeCategory })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selected ? "bg-sprout-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-sprout-50"
                }`}
              >
                {STATUS_LABELS[st].text}
              </Link>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card py-10 text-center text-sm text-slate-500">
          {allItems.length === 0 ? (
            <div className="space-y-3">
              <p>还没有错题记录，拍一道题试试吧！</p>
              <Link href="/capture" className="btn-primary inline-flex">
                📷 去录入第一道错题
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p>当前筛选条件下没有错题。</p>
              <Link href="/mistakes" className="text-sprout-700 underline">
                显示全部错题
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
