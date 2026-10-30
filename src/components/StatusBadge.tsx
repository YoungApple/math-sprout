import type { ErrorCategory } from "@/lib/gemini";
import type { ReviewStatus } from "@/lib/review";

export const STATUS_LABELS: Record<ReviewStatus, { text: string; cls: string }> = {
  PENDING: { text: "待攻克", cls: "bg-rose-100 text-rose-700" },
  CONSOLIDATING: { text: "巩固中", cls: "bg-amber-100 text-amber-700" },
  MASTERED: { text: "已掌握", cls: "bg-sprout-100 text-sprout-700" },
  RELAPSED: { text: "易复发", cls: "bg-purple-100 text-purple-700" },
};

export const ERROR_CATEGORIES: readonly ErrorCategory[] = [
  "EXECUTION_ERROR",
  "PERCEPTION_ERROR",
  "CONCEPT_CONFUSION",
  "MODELING_GAP",
];

export const ERROR_LABELS: Record<string, string> = {
  EXECUTION_ERROR: "计算/书写",
  PERCEPTION_ERROR: "审题理解",
  CONCEPT_CONFUSION: "概念混淆",
  MODELING_GAP: "建模卡壳",
};

export const ERROR_META: Record<
  ErrorCategory,
  {
    label: string;
    icon: string;
    desc: string;
    badgeCls: string;
    cardActiveCls: string;
    barCls: string;
  }
> = {
  EXECUTION_ERROR: {
    label: "计算/书写",
    icon: "✏️",
    desc: "进退位失误、口算粗心、抄错数或漏写单位",
    badgeCls: "bg-amber-100 text-amber-800",
    cardActiveCls: "ring-2 ring-amber-500 bg-amber-50/70",
    barCls: "bg-amber-400",
  },
  PERCEPTION_ERROR: {
    label: "审题理解",
    icon: "👀",
    desc: "漏看关键条件、看错问题（如求差算成求和）",
    badgeCls: "bg-sky-100 text-sky-800",
    cardActiveCls: "ring-2 ring-sky-500 bg-sky-50/70",
    barCls: "bg-sky-400",
  },
  CONCEPT_CONFUSION: {
    label: "概念混淆",
    icon: "🧩",
    desc: "周长与面积、余数与除数、单位进率等概念混淆",
    badgeCls: "bg-purple-100 text-purple-800",
    cardActiveCls: "ring-2 ring-purple-500 bg-purple-50/70",
    barCls: "bg-purple-400",
  },
  MODELING_GAP: {
    label: "建模卡壳",
    icon: "🧭",
    desc: "多步应用题找不准数量关系或不知如何列式",
    badgeCls: "bg-rose-100 text-rose-800",
    cardActiveCls: "ring-2 ring-rose-500 bg-rose-50/70",
    barCls: "bg-rose-400",
  },
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const l = STATUS_LABELS[status] ?? STATUS_LABELS.PENDING;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.cls}`}>{l.text}</span>;
}

export function ErrorBadge({
  category,
  prefix = false,
}: {
  category?: string | null;
  prefix?: boolean;
}) {
  if (!category) return null;
  const meta = ERROR_META[category as ErrorCategory];
  const label = meta?.label ?? ERROR_LABELS[category] ?? category;
  const cls = meta?.badgeCls ?? "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {meta?.icon && <span>{meta.icon}</span>}
      <span>{prefix ? `错因：${label}` : label}</span>
    </span>
  );
}
