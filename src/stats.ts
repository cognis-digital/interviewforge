import type { Question, StateFile } from "./types.js";
import { getSchedule } from "./state.js";
import { isDue, isMastered } from "./sm2.js";

/** Aggregated counts for a single topic. */
export interface TopicStat {
  topic: string;
  total: number;
  reviewed: number;
  due: number;
  mastered: number;
}

/** Whole-bank aggregate plus per-topic breakdown. */
export interface Stats {
  total: number;
  reviewed: number;
  due: number;
  mastered: number;
  byTopic: TopicStat[];
}

/**
 * Compute study statistics over a bank given current scheduling state.
 * Pure: caller supplies `now` (epoch ms).
 */
export function computeStats(
  questions: Question[],
  state: StateFile,
  now: number,
): Stats {
  const topics = new Map<string, TopicStat>();
  let total = 0;
  let reviewed = 0;
  let due = 0;
  let mastered = 0;

  for (const q of questions) {
    const sched = getSchedule(state, q.id);
    const isReviewed = sched.reviews > 0;
    const dueNow = isDue(sched, now);
    const masteredNow = isMastered(sched);

    total++;
    if (isReviewed) reviewed++;
    if (dueNow) due++;
    if (masteredNow) mastered++;

    let t = topics.get(q.topic);
    if (!t) {
      t = { topic: q.topic, total: 0, reviewed: 0, due: 0, mastered: 0 };
      topics.set(q.topic, t);
    }
    t.total++;
    if (isReviewed) t.reviewed++;
    if (dueNow) t.due++;
    if (masteredNow) t.mastered++;
  }

  const byTopic = [...topics.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  return { total, reviewed, due, mastered, byTopic };
}

/**
 * Select the questions to study, filtered by optional topic and due-only flag,
 * ordered so the most-overdue (and never-seen) cards come first.
 */
export function selectStudyQueue(
  questions: Question[],
  state: StateFile,
  now: number,
  opts: { topic?: string; dueOnly?: boolean } = {},
): Question[] {
  let pool = questions;
  if (opts.topic) {
    pool = pool.filter((q) => q.topic === opts.topic);
  }
  if (opts.dueOnly) {
    pool = pool.filter((q) => isDue(getSchedule(state, q.id), now));
  }

  return [...pool].sort((a, b) => {
    const sa = getSchedule(state, a.id);
    const sb = getSchedule(state, b.id);
    // Never-reviewed cards (dueAt undefined) sort first.
    const da = sa.dueAt ?? -Infinity;
    const db = sb.dueAt ?? -Infinity;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}
