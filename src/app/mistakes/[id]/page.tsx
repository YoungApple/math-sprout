import { notFound } from "next/navigation";
import { getMistake } from "@/lib/repo";
import { MathText } from "@/components/MathText";
import { StatusBadge, ERROR_LABELS } from "@/components/StatusBadge";
import { HintStepper } from "@/components/HintStepper";
import { VariantQuiz } from "@/components/VariantQuiz";

export const dynamic = "force-dynamic";

export default async function MistakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMistake(id);
  if (!m) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusBadge status={m.review.status} />
        {m.grade && <span>{m.grade} 年级</span>}
        {m.category && <span>· {m.category}</span>}
        {m.source && <span>· {m.source}</span>}
        <span className="ml-auto">{new Date(m.createdAt).toLocaleString("zh-CN")}</span>
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">原题</h2>
        <MathText className="text-[17px]">{m.stemText}</MathText>
        <details>
          <summary className="cursor-pointer text-xs text-slate-400">查看原始照片</summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.imageUrl} alt="原始照片" className="mt-2 w-full rounded-xl" />
        </details>
      </section>

      <section className="card space-y-2 border-l-4 border-rose-400">
        <h2 className="text-sm font-semibold text-rose-600">错因诊断 · {ERROR_LABELS[m.errorCategory] ?? m.errorCategory}</h2>
        <MathText>{m.rootCause}</MathText>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {m.knowledgePoints.map((k) => (
            <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{k}</span>
          ))}
        </div>
        <p className="text-xs text-slate-400">孩子写的：{m.studentAnswer || "（空）"} · 正确答案：{m.correctAnswer}</p>
      </section>

      {m.svgDiagram && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">画个图想一想</h2>
          <div className="overflow-x-auto [&>svg]:mx-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: m.svgDiagram }} />
        </section>
      )}

      <HintStepper hints={m.hints} correctAnswer={m.correctAnswer} />

      <VariantQuiz mistakeId={m.id} variants={m.variants} attempts={m.attempts} initialReview={m.review} />
    </div>
  );
}
