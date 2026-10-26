import Link from "next/link";
import { listMistakes } from "@/lib/repo";
import { MistakeCard } from "@/components/MistakeCard";

export const dynamic = "force-dynamic";

/** Home: today's Ebbinghaus review queue (max 3) + quick capture entry. */
export default async function HomePage() {
  const due = await listMistakes({ dueOnly: true, limit: 3 });
  const total = (await listMistakes({ limit: 100 })).length;

  return (
    <div className="space-y-5">
      <section className="card bg-gradient-to-br from-sprout-600 to-emerald-500 text-white ring-0">
        <h1 className="text-xl font-bold">今日消灭错题 🎯</h1>
        <p className="mt-1 text-sm text-white/90">
          {due.length === 0 ? "今天没有待复习的题目，去录入新错题吧！" : `今天有 ${due.length} 道题等你挑战，约需 10 分钟。`}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/capture" className="btn bg-white text-sprout-700">📷 拍照录题</Link>
          {due.length > 0 && <Link href={`/mistakes/${due[0].id}`} className="btn bg-white/20 text-white ring-1 ring-white/50">开始挑战 →</Link>}
        </div>
      </section>

      {due.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">待复习</h2>
          {due.map((m) => <MistakeCard key={m.id} m={m} />)}
        </section>
      )}

      <section className="card flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">错题库累计</div>
          <div className="text-2xl font-bold text-sprout-700">{total} 题</div>
        </div>
        <Link href="/mistakes" className="btn-ghost">查看全部</Link>
      </section>
    </div>
  );
}
