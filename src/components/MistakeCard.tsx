import Link from "next/link";
import type { Mistake } from "@/lib/repo";
import { formatShortDateZh } from "@/lib/review";
import { MathText } from "./MathText";
import { StatusBadge, ERROR_LABELS } from "./StatusBadge";

export function MistakeCard({ m }: { m: Mistake }) {
  const createdDate = formatShortDateZh(m.createdAt);
  const nextReviewDate = formatShortDateZh(m.review.nextReviewAt);
  const showNextReview = m.review.status === "MASTERED" && !m.progress.isDue;

  return (
    <Link href={`/mistakes/${m.id}`} className="card block transition hover:ring-sprout-500/40">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusBadge status={m.review.status} />
        {m.grade && <span>{m.grade} 年级</span>}
        {m.category && <span>· {m.category}</span>}
        <span className="ml-auto">{createdDate}</span>
      </div>
      <MathText className="line-clamp-3 text-[15px]">{m.stemText}</MathText>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-rose-600">错因：{ERROR_LABELS[m.errorCategory] ?? m.errorCategory}</span>
        <span className="text-slate-400">
          {showNextReview
            ? `下次复习 ${nextReviewDate} · 第 ${m.review.stage} 阶`
            : `本轮变式 ${m.progress.solvedCount}/${m.progress.totalVariants || 3}`}
        </span>
      </div>
    </Link>
  );
}
