import { listMistakes } from "@/lib/repo";
import { MistakeCard } from "@/components/MistakeCard";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const items = await listMistakes({ limit: 100 });
  const byCategory = new Map<string, number>();
  for (const m of items) byCategory.set(m.category ?? "未分类", (byCategory.get(m.category ?? "未分类") ?? 0) + 1);
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">错题库</h1>
      {top.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">薄弱知识点 Top 5</h2>
          <ul className="space-y-1.5">
            {top.map(([cat, n]) => (
              <li key={cat} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{cat}</span>
                <span className="h-2 rounded-full bg-rose-400" style={{ width: `${Math.max(8, (n / items.length) * 160)}px` }} />
                <span className="w-8 text-right text-slate-500">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {items.length === 0 ? (
        <p className="text-center text-slate-500">还没有错题，点右上角「录题」开始吧。</p>
      ) : (
        items.map((m) => <MistakeCard key={m.id} m={m} />)
      )}
    </div>
  );
}
