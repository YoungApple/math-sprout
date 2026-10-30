import Link from "next/link";
import type { Mistake } from "@/lib/repo";
import { formatShortDateZh } from "@/lib/review";
import { normalizeCategory, normalizeTerm } from "@/lib/taxonomy";
import { MathText } from "./MathText";
import { ErrorBadge, StatusBadge } from "./StatusBadge";

function formatGradeTerm(grade: number | null, term: string | null): string | null {
  const cleanTerm = normalizeTerm(term) ?? term;
  if (grade && cleanTerm) return `${grade}年级${cleanTerm}`;
  if (grade) return `${grade}年级`;
  if (cleanTerm) return cleanTerm;
  return null;
}

export function MistakeCard({ m }: { m: Mistake }) {
  const createdDate = formatShortDateZh(m.createdAt);
  const nextReviewDate = formatShortDateZh(m.review.nextReviewAt);
  const showNextReview = m.review.status === "MASTERED" && !m.progress.isDue;
  const gradeTermLabel = formatGradeTerm(m.grade, m.term);
  const normalizedCat = m.category ? normalizeCategory(m.category).full : null;
  const visibleTags = m.knowledgePoints.slice(0, 3);
  const extraTagCount = Math.max(0, m.knowledgePoints.length - visibleTags.length);

  return (
    <Link href={`/mistakes/${m.id}`} className="card block space-y-2.5 transition hover:ring-sprout-500/40">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <StatusBadge status={m.review.status} />
        {gradeTermLabel && (
          <span className="rounded-full bg-sprout-50 px-2 py-0.5 font-medium text-sprout-700">
            {gradeTermLabel}
          </span>
        )}
        {normalizedCat && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{normalizedCat}</span>
        )}
        {m.source && (
          <span className="max-w-[11rem] truncate rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
            📄 {m.source}
          </span>
        )}
        <span className="ml-auto text-slate-400">{createdDate}</span>
      </div>

      <MathText className="line-clamp-3 text-[15px]">{m.stemText}</MathText>

      {visibleTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((kp) => (
            <span key={kp} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              #{kp}
            </span>
          ))}
          {extraTagCount > 0 && <span className="text-[11px] text-slate-400">+{extraTagCount}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
        <ErrorBadge category={m.errorCategory} prefix />
        <span className="text-slate-400">
          {showNextReview
            ? `下次复习 ${nextReviewDate} · 第 ${m.review.stage} 阶`
            : `本轮变式 ${m.progress.solvedCount}/${m.progress.totalVariants || 3}`}
        </span>
      </div>
    </Link>
  );
}
