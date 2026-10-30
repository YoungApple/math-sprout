import { isAnswerCorrect as checkAnswerCorrect } from "./math-answer";

/**
 * Ebbinghaus spaced-review scheduling + round-scoped mastery state machine.
 *
 *   PENDING ──(L1/partial correct)──▶ CONSOLIDATING ──(all L1..L3 correct in round)──▶ MASTERED
 *      ▲                                    │ (wrong on initial round)                     │ (wrong on due review)
 *      └────────────────────────────────────┘                                              ▼
 *      ◀─────────────────────────────────────────────────────────────────────────────── RELAPSED
 */

export type ReviewStatus = "PENDING" | "CONSOLIDATING" | "MASTERED" | "RELAPSED";
export type VariantLevel = "L1" | "L2" | "L3";

/** Days until next review after each completed mastery stage (stage 0->1 is 1 day, etc.). */
export const EBBINGHAUS_DAYS = [1, 2, 4, 7, 15, 30];

export const FAMILY_TIMEZONE = "Asia/Shanghai";

/** Asia/Shanghai is UTC+8 year-round; study days roll over at 04:00 local time (= UTC + 4h). */
const STUDY_DAY_SHIFT_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewState {
  status: ReviewStatus;
  stage: number;
  nextReviewAt: string; // ISO
  round: number;
}

export interface VariantRef {
  id: string;
  level: VariantLevel;
}

export interface AttemptRef {
  variantId: string;
  isCorrect: boolean;
  round?: number;
}

export interface ReviewProgress {
  activeRound: number;
  isDue: boolean;
  isScheduledReview: boolean;
  solvedVariantIds: string[];
  solvedLevels: VariantLevel[];
  attemptCountsByVariant: Record<string, number>;
  allLevelsCorrect: boolean;
  totalVariants: number;
  solvedCount: number;
}

export function initialReviewState(now = new Date()): ReviewState {
  return {
    status: "PENDING",
    stage: 0,
    nextReviewAt: now.toISOString(),
    round: 0,
  };
}

export function isDue(state: Pick<ReviewState, "nextReviewAt">, now = new Date()): boolean {
  if (!state.nextReviewAt) return true;
  const dueMs = new Date(state.nextReviewAt).getTime();
  if (Number.isNaN(dueMs)) return true;
  return dueMs <= now.getTime();
}

/**
 * Computes 04:00 Asia/Shanghai `daysAhead` study-days from `now`.
 * Finishing at 21:30 Mon schedules Tue 04:00 (+08:00), so Tue 19:00 is always ready.
 */
export function nextStudyDayBoundary(now: Date, daysAhead: number): Date {
  const shifted = new Date(now.getTime() + STUDY_DAY_SHIFT_MS);
  const targetShiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + daysAhead,
    0,
    0,
    0,
    0,
  );
  return new Date(targetShiftedMidnight - STUDY_DAY_SHIFT_MS);
}

function keepDueNow(existingNextReviewAt: string, now: Date): string {
  const existingMs = existingNextReviewAt ? new Date(existingNextReviewAt).getTime() : NaN;
  if (!Number.isNaN(existingMs) && existingMs <= now.getTime()) {
    return existingNextReviewAt;
  }
  return now.toISOString();
}

/**
 * Single source of truth for active-round progress across both server repo and VariantQuiz UI.
 * When a MASTERED item reaches nextReviewAt, activeRound automatically advances to round + 1,
 * unlocking all variant inputs for the scheduled review without requiring a write-on-GET.
 */
export function deriveProgress(
  rawState: Omit<ReviewState, "round"> & { round?: number },
  variants: VariantRef[],
  attempts: AttemptRef[],
  now = new Date(),
): ReviewProgress {
  const baseRound = rawState.round ?? 0;
  const due = isDue(rawState, now);
  const isScheduledReview = rawState.status === "MASTERED" && due;
  const activeRound = isScheduledReview ? baseRound + 1 : baseRound;

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const solvedIdSet = new Set<string>();
  const solvedLevelSet = new Set<VariantLevel>();
  const attemptCountsByVariant: Record<string, number> = {};

  for (const a of attempts) {
    const r = a.round ?? 0;
    if (r !== activeRound) continue;
    attemptCountsByVariant[a.variantId] = (attemptCountsByVariant[a.variantId] ?? 0) + 1;
    if (a.isCorrect) {
      solvedIdSet.add(a.variantId);
      const v = variantById.get(a.variantId);
      if (v) solvedLevelSet.add(v.level);
    }
  }

  const requiredLevels: VariantLevel[] =
    variants.length > 0 ? [...new Set(variants.map((v) => v.level))] : ["L1", "L2", "L3"];
  const allLevelsCorrect = requiredLevels.length > 0 && requiredLevels.every((l) => solvedLevelSet.has(l));

  return {
    activeRound,
    isDue: due,
    isScheduledReview,
    solvedVariantIds: [...solvedIdSet],
    solvedLevels: [...solvedLevelSet],
    attemptCountsByVariant,
    allLevelsCorrect,
    totalVariants: variants.length,
    solvedCount: solvedIdSet.size,
  };
}

/**
 * Pure state machine transition given full active-round context:
 * - Idempotent no-op if already MASTERED and not yet due.
 * - Keeps PENDING & CONSOLIDATING due today (never evicts unfinished work from Today's queue).
 * - Advances Ebbinghaus stage starting at EBBINGHAUS_DAYS[0] = 1 day aligned to 04:00 Asia/Shanghai.
 */
export function applyAttempt(
  rawState: Omit<ReviewState, "round"> & { round?: number },
  variants: VariantRef[],
  priorAttempts: AttemptRef[],
  newAttempt: { variantId: string; isCorrect: boolean },
  now = new Date(),
): ReviewState {
  const state: ReviewState = { ...rawState, round: rawState.round ?? 0 };
  const pre = deriveProgress(state, variants, priorAttempts, now);

  // Guard against stage inflation if a client re-submits on an already-MASTERED, non-due item
  if (state.status === "MASTERED" && !pre.isDue) {
    return state;
  }

  const attemptRecord: AttemptRef = {
    variantId: newAttempt.variantId,
    isCorrect: newAttempt.isCorrect,
    round: pre.activeRound,
  };
  const post = deriveProgress(
    { ...state, status: state.status === "MASTERED" ? "CONSOLIDATING" : state.status, round: pre.activeRound },
    variants,
    [...priorAttempts, attemptRecord],
    now,
  );

  if (!newAttempt.isCorrect) {
    const wasScheduledOrMastered = state.status === "MASTERED" || state.stage > 0;
    const status: ReviewStatus = wasScheduledOrMastered ? "RELAPSED" : "PENDING";
    // If relapsing mid-round after solving >=1 variant, advance round so recovery requires a clean full pass
    const nextRound = wasScheduledOrMastered && pre.solvedCount > 0 ? pre.activeRound + 1 : pre.activeRound;
    return {
      status,
      stage: 0,
      round: nextRound,
      nextReviewAt: keepDueNow(state.nextReviewAt, now),
    };
  }

  if (post.allLevelsCorrect) {
    const intervalIdx = Math.min(state.stage, EBBINGHAUS_DAYS.length - 1);
    const intervalDays = EBBINGHAUS_DAYS[intervalIdx];
    const nextStage = Math.min(state.stage + 1, EBBINGHAUS_DAYS.length);
    return {
      status: "MASTERED",
      stage: nextStage,
      round: pre.activeRound,
      nextReviewAt: nextStudyDayBoundary(now, intervalDays).toISOString(),
    };
  }

  return {
    status: "CONSOLIDATING",
    stage: state.stage,
    round: pre.activeRound,
    nextReviewAt: keepDueNow(state.nextReviewAt, now),
  };
}

export interface AttemptSummary {
  level: VariantLevel;
  isCorrect: boolean;
  /** Whether, including this attempt, every level L1..L3 has at least one correct answer in the active round. */
  allLevelsCorrect: boolean;
}

/** Low-level single-step transition helper (preserved for direct state-table tests). */
export function transition(
  rawState: Omit<ReviewState, "round"> & { round?: number },
  a: AttemptSummary,
  now = new Date(),
): ReviewState {
  const state: ReviewState = { ...rawState, round: rawState.round ?? 0 };
  if (state.status === "MASTERED" && !isDue(state, now)) {
    return state;
  }
  const activeRound = state.status === "MASTERED" && isDue(state, now) ? state.round + 1 : state.round;

  if (!a.isCorrect) {
    const status: ReviewStatus = state.status === "MASTERED" || state.stage > 0 ? "RELAPSED" : "PENDING";
    return { status, stage: 0, round: activeRound, nextReviewAt: keepDueNow(state.nextReviewAt, now) };
  }
  if (a.allLevelsCorrect) {
    const intervalIdx = Math.min(state.stage, EBBINGHAUS_DAYS.length - 1);
    const nextStage = Math.min(state.stage + 1, EBBINGHAUS_DAYS.length);
    return {
      status: "MASTERED",
      stage: nextStage,
      round: activeRound,
      nextReviewAt: nextStudyDayBoundary(now, EBBINGHAUS_DAYS[intervalIdx]).toISOString(),
    };
  }
  return {
    status: "CONSOLIDATING",
    stage: state.stage,
    round: activeRound,
    nextReviewAt: keepDueNow(state.nextReviewAt, now),
  };
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Deterministic Asia/Shanghai date formatting (eliminates SSR UTC vs browser hydration mismatch #418). */
export function formatDateZh(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: FAMILY_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(dt);
}

export function formatShortDateZh(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: FAMILY_TIMEZONE,
    month: "numeric",
    day: "numeric",
  }).format(dt);
}

export function formatDateTimeZh(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: FAMILY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

export function isAnswerCorrect(user: string, expected: string): boolean {
  return checkAnswerCorrect(user, expected);
}
