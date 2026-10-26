import Link from "next/link";
import type { Mistake } from "@/lib/repo";
import { MathText } from "./MathText";
import { StatusBadge, ERROR_LABELS } from "./StatusBadge";

export function MistakeCard({ m }: { m: Mistake }) {
  const date = new Date(m.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return (
    <Link href={`/mistakes/${m.id}`} className="card block hover:ring-sprout-100">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusBadge status={m.review.status} />
        {m.grade && <span>{m.grade} 年级</span>}
        {m.category && <span>· {m.category}</span>}
        <span className="ml-auto">{date}</span>
      </div>
      <MathText className="line-clamp-3 text-[15px]">{m.stemText}</MathText>
      <div className="mt-2 text-xs text-rose-600">错因：{ERROR_LABELS[m.errorCategory] ?? m.errorCategory}</div>
    </Link>
  );
}
