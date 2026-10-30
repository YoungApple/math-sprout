import Link from "next/link";
import { countMistakes, listMistakes } from "@/lib/repo";
import { MistakeCard } from "@/components/MistakeCard";
import { SampleMistakeButton } from "@/components/SampleMistakeButton";

export const dynamic = "force-dynamic";

/** Home: today's Ebbinghaus review queue (max 3) + zero-friction onboarding & capture entry. */
export default async function HomePage() {
  const [due, counts] = await Promise.all([
    listMistakes({ dueOnly: true, limit: 3 }),
    countMistakes(),
  ]);

  return (
    <div className="space-y-5">
      <section className="card bg-gradient-to-br from-sprout-600 to-emerald-500 text-white ring-0">
        <h1 className="text-xl font-bold">今日消灭错题 🎯</h1>
        <p className="mt-1 text-sm text-white/90">
          {counts.total === 0
            ? "拍下孩子做错的一道数学题，AI 只启发不剧透，3 道变式题验证真掌握。"
            : counts.due === 0
              ? "太棒了！今天的复习任务已全部清空，可以去录入新错题啦！"
              : `今天有 ${counts.due} 道错题等你闯关（本轮展示前 ${due.length} 道，约需 ${Math.max(3, due.length * 3)} 分钟）。`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/capture" className="btn bg-white text-sprout-700">
            📷 拍照 / 选图录题
          </Link>
          {due.length > 0 && (
            <Link href={`/mistakes/${due[0].id}`} className="btn bg-white/20 text-white ring-1 ring-white/50">
              开始闯关 →
            </Link>
          )}
        </div>
      </section>

      {counts.total === 0 && (
        <section className="card space-y-3 border border-dashed border-sprout-500/40 bg-white">
          <div>
            <h2 className="font-semibold text-slate-800">👋 第一次使用？手边没试卷也能立即体验</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              一键载入一道三年级高频“差倍审题”易错题，直观体验：启发式三步提示 → 线段图脚手架 → L1/L2/L3 举一反三闯关。
            </p>
          </div>
          <SampleMistakeButton />
        </section>
      )}

      {due.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">待闯关 / 待复习</h2>
            {counts.due > due.length && (
              <Link href="/mistakes" className="text-xs text-sprout-700 hover:underline">
                共 {counts.due} 道待复习 →
              </Link>
            )}
          </div>
          {due.map((m) => (
            <MistakeCard key={m.id} m={m} />
          ))}
        </section>
      )}

      <section className="card flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-slate-500">错题库累计</div>
            <div className="text-2xl font-bold text-sprout-700">{counts.total} 题</div>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          <div>
            <div className="text-xs text-slate-500">已掌握</div>
            <div className="text-2xl font-bold text-emerald-600">{counts.mastered} 题</div>
          </div>
        </div>
        <Link href="/mistakes" className="btn-ghost text-sm">
          查看全部
        </Link>
      </section>
    </div>
  );
}
