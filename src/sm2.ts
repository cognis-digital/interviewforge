/**
 * SM-2 spaced-repetition scheduling.
 *
 * This is an original implementation of the SM-2 algorithm family (the classic
 * ease-factor / interval / repetition-count scheme). All logic here is PURE:
 * given the prior scheduling state and a recall grade, it returns the next
 * scheduling state. No clocks, no I/O. The caller supplies "now" so the
 * function stays deterministic and unit-testable.
 */

/** A recall grade, 0 (total blank) through 5 (perfect, instant recall). */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

/** Per-question scheduling state. */
export interface Schedule {
  /** Number of consecutive successful (grade >= 3) recalls. */
  repetitions: number;
  /** Ease factor; floor of 1.3. Higher = easier = longer intervals. */
  ease: number;
  /** Current interval in whole days until the next review. */
  intervalDays: number;
  /**
   * Epoch milliseconds at which this card is next due. When undefined the
   * card has never been reviewed and is considered due immediately.
   */
  dueAt?: number;
  /** Epoch milliseconds of the most recent review, if any. */
  lastReviewedAt?: number;
  /** Total number of reviews this card has received. */
  reviews: number;
}

/** Minimum allowed ease factor in classic SM-2. */
export const MIN_EASE = 1.3;
/** Ease factor for a brand-new card. */
export const DEFAULT_EASE = 2.5;
/** Milliseconds in a day. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the scheduling state for a never-reviewed card. */
export function freshSchedule(): Schedule {
  return {
    repetitions: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    reviews: 0,
  };
}

/** Type guard / coercion for a recall grade. */
export function isGrade(n: number): n is Grade {
  return Number.isInteger(n) && n >= 0 && n <= 5;
}

/**
 * Compute the next ease factor from the prior ease and a grade.
 *
 * Uses the standard SM-2 update:
 *   EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * clamped to a floor of MIN_EASE.
 */
export function nextEase(ease: number, grade: Grade): number {
  const q = grade;
  const updated = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return updated < MIN_EASE ? MIN_EASE : updated;
}

/**
 * Apply one review to a schedule and return the NEW schedule.
 *
 * @param prev  prior scheduling state
 * @param grade recall quality, 0..5
 * @param now   epoch ms of this review (caller-supplied for determinism)
 *
 * Rules:
 *  - A grade < 3 is a lapse: repetitions reset to 0, interval back to 1 day.
 *    The ease factor is still nudged down per the formula.
 *  - A grade >= 3 advances the repetition count. Intervals grow:
 *      rep 1 -> 1 day, rep 2 -> 6 days, rep >= 3 -> round(prevInterval * ease).
 *  - dueAt = now + intervalDays.
 */
export function review(prev: Schedule, grade: Grade, now: number): Schedule {
  if (!isGrade(grade)) {
    throw new RangeError(`grade must be an integer 0..5, got ${grade}`);
  }

  const ease = nextEase(prev.ease, grade);
  let repetitions: number;
  let intervalDays: number;

  if (grade < 3) {
    // Lapse: relearn from the start.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      // Grow from the previous interval. Guard against a zero prior interval
      // (a card whose first successful review we're processing).
      const base = prev.intervalDays > 0 ? prev.intervalDays : 1;
      intervalDays = Math.round(base * ease);
    }
  }

  return {
    repetitions,
    ease,
    intervalDays,
    dueAt: now + intervalDays * DAY_MS,
    lastReviewedAt: now,
    reviews: prev.reviews + 1,
  };
}

/** True if the card is due for review at the given time. */
export function isDue(schedule: Schedule, now: number): boolean {
  if (schedule.dueAt === undefined) return true; // never reviewed
  return schedule.dueAt <= now;
}

/**
 * Mastery heuristic: a card counts as "mastered" once it has been recalled
 * successfully enough times to have earned a long interval. We treat an
 * interval of >= 21 days with at least 3 repetitions as mastered.
 */
export function isMastered(schedule: Schedule): boolean {
  return schedule.repetitions >= 3 && schedule.intervalDays >= 21;
}
