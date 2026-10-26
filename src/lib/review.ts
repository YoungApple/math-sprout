/**
 * Ebbinghaus review scheduling + mastery state machine.
 *
 *   PENDING ──(L1 correct)──▶ CONSOLIDATING ──(L2 & L3 correct)──▶ MASTERED
 *      ▲                           │  (any wrong)                      │ (wrong on a scheduled review)
 *      └───────────────────────────┘                                   ▼
 *      ◀──────────────────────────────────────────────────────────── RELAPSED
 */

export type ReviewStatus = "PENDING" | "CONSOLIDATING" | "MASTERED" | "RELAPSED";
export type VariantLevel = "L1" | "L2" | "L3";

/** Days until next review for each successfully completed stage. */
export const EBBINGHAUS_DAYS = [1, 2, 4, 7, 15, 30];

export interface ReviewState {
  status: ReviewStatus;
  stage: number;
  nextReviewAt: string; // ISO
}

export function initialReviewState(now = new Date()): ReviewState {
  return { status: "PENDING", stage: 0, nextReviewAt: addDays(now, 0).toISOString() };
}

export interface AttemptSummary {
  level: VariantLevel;
  isCorrect: boolean;
  /** Whether, including this attempt, every level L1..L3 has at least one correct answer. */
  allLevelsCorrect: boolean;
}

export function transition(state: ReviewState, a: AttemptSummary, now = new Date()): ReviewState {
  if (!a.isCorrect) {
    // A miss while mastered means the skill decayed; otherwise fall back to the start.
    const status: ReviewStatus = state.status === "MASTERED" ? "RELAPSED" : "PENDING";
    return { status, stage: 0, nextReviewAt: addDays(now, 1).toISOString() };
  }
  if (a.allLevelsCorrect) {
    const stage = Math.min(state.stage + 1, EBBINGHAUS_DAYS.length - 1);
    return { status: "MASTERED", stage, nextReviewAt: addDays(now, EBBINGHAUS_DAYS[stage]).toISOString() };
  }
  if (state.status === "PENDING" || state.status === "RELAPSED") {
    return { status: "CONSOLIDATING", stage: state.stage, nextReviewAt: addDays(now, 1).toISOString() };
  }
  return state;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Lenient answer comparison for primary-school math:
 * strips whitespace/units, understands fractions like 3/4 and Chinese punctuation.
 */
export function isAnswerCorrect(user: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .replace(/[，、]/g, ",")
      .replace(/[：]/g, ":")
      .replace(/\s+/g, "")
      .replace(/(个|元|米|厘米|千米|克|千克|吨|分钟|小时|秒|人|只|本|棵|块|辆|升|毫升|平方米|平方厘米|立方米|立方厘米|cm|m|km|kg|g)$/i, "")
      .toLowerCase();
  const u = norm(user);
  const e = norm(expected);
  if (u === e) return true;
  const nu = toNumber(u);
  const ne = toNumber(e);
  return nu !== null && ne !== null && Math.abs(nu - ne) < 1e-6;
}

function toNumber(s: string): number | null {
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const mixed = s.match(/^(-?\d+)又(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const pct = s.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) return Number(pct[1]) / 100;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
