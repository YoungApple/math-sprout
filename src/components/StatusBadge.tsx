import type { ReviewStatus } from "@/lib/review";

export const STATUS_LABELS: Record<ReviewStatus, { text: string; cls: string }> = {
  PENDING: { text: "待攻克", cls: "bg-rose-100 text-rose-700" },
  CONSOLIDATING: { text: "巩固中", cls: "bg-amber-100 text-amber-700" },
  MASTERED: { text: "已掌握", cls: "bg-sprout-100 text-sprout-700" },
  RELAPSED: { text: "易复发", cls: "bg-purple-100 text-purple-700" },
};

export const ERROR_LABELS: Record<string, string> = {
  EXECUTION_ERROR: "计算/书写",
  PERCEPTION_ERROR: "审题理解",
  CONCEPT_CONFUSION: "概念混淆",
  MODELING_GAP: "建模卡壳",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const l = STATUS_LABELS[status] ?? STATUS_LABELS.PENDING;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.cls}`}>{l.text}</span>;
}
