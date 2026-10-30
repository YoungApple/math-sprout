import { notFound } from "next/navigation";
import { getMistake, getNextDueMistakeId } from "@/lib/repo";
import { formatDateTimeZh } from "@/lib/review";
import { MathText } from "@/components/MathText";
import { StatusBadge, ERROR_LABELS } from "@/components/StatusBadge";
import { HintStepper } from "@/components/HintStepper";
import { VariantQuiz } from "@/components/VariantQuiz";
import { DeleteMistakeButton } from "@/components/DeleteMistakeButton";

export const dynamic = "force-dynamic";

export default async function MistakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m, nextDueMistakeId] = await Promise.all([
    getMistake(id),
    getNextDueMistakeId(id),
  ]);
  if (!m) notFound();

  const parentOpenByDefault = m.review.status === "MASTERED" && !m.progress.isDue;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusBadge status={m.review.status} />
        {m.grade && <span>{m.grade} 年级</span>}
        {m.category && <span>· {m.category}</span>}
        {m.source && <span>· {m.source}</span>}
        <span className="ml-auto flex items-center gap-2">
          <span>{formatDateTimeZh(m.createdAt)}</span>
          <DeleteMistakeButton mistakeId={m.id} />
        </span>
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">📖 原题</h2>
        <MathText className="text-[17px]">{m.stemText}</MathText>
        <details>
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            查看原始照片（支持双指放大查看手写细节）
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.imageUrl} alt="原始照片" className="mt-2 w-full rounded-xl" />
        </details>
      </section>

      <HintStepper hints={m.hints} correctAnswer={m.correctAnswer} svgDiagram={m.svgDiagram} />

      <details className="card border-l-4 border-rose-400" open={parentOpenByDefault}>
        <summary className="cursor-pointer select-none text-sm font-semibold text-rose-600">
          👩‍💼 家长错因诊断 · {ERROR_LABELS[m.errorCategory] ?? m.errorCategory}
          <span className="ml-2 text-xs font-normal text-slate-400">
            （含原题答案，建议孩子先完成启发思考再展开）
          </span>
        </summary>
        <div className="mt-3 space-y-2.5">
          <MathText>{m.rootCause}</MathText>
          {m.knowledgePoints.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {m.knowledgePoints.map((k) => (
                <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  #{k}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-slate-500">
            <span>孩子写的：</span>
            <MathText inline>{m.studentAnswer || "（空）"}</MathText>
            <span className="mx-1.5">·</span>
            <span>原题正确答案：</span>
            <MathText inline>{m.correctAnswer}</MathText>
          </div>
        </div>
      </details>

      <VariantQuiz
        mistakeId={m.id}
        variants={m.variants}
        attempts={m.attempts}
        initialReview={m.review}
        initialProgress={m.progress}
        nextDueMistakeId={nextDueMistakeId}
      />
    </div>
  );
}
