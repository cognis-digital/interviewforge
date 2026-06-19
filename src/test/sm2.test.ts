import { test } from "node:test";
import assert from "node:assert/strict";
import {
  review,
  nextEase,
  freshSchedule,
  isDue,
  isMastered,
  isGrade,
  MIN_EASE,
  DEFAULT_EASE,
  DAY_MS,
  type Schedule,
} from "../sm2.js";

const NOW = 1_700_000_000_000; // fixed epoch ms

test("isGrade accepts 0..5 integers only", () => {
  for (let g = 0; g <= 5; g++) assert.equal(isGrade(g), true);
  assert.equal(isGrade(-1), false);
  assert.equal(isGrade(6), false);
  assert.equal(isGrade(2.5), false);
  assert.equal(isGrade(NaN), false);
});

test("freshSchedule has default ease and zero history", () => {
  const s = freshSchedule();
  assert.equal(s.ease, DEFAULT_EASE);
  assert.equal(s.repetitions, 0);
  assert.equal(s.intervalDays, 0);
  assert.equal(s.reviews, 0);
  assert.equal(s.dueAt, undefined);
});

test("nextEase increases on perfect recall and clamps at the floor", () => {
  // grade 5: EF + 0.1
  assert.ok(Math.abs(nextEase(2.5, 5) - 2.6) < 1e-9);
  // grade 3 leaves ease unchanged: 0.1 - 2*(0.08 + 2*0.02) = 0.1 - 0.24 = -0.14
  assert.ok(Math.abs(nextEase(2.5, 3) - 2.36) < 1e-9);
  // repeated low grades never go below the floor
  let e = 1.3;
  for (let i = 0; i < 10; i++) e = nextEase(e, 0);
  assert.equal(e, MIN_EASE);
});

test("first successful review sets a one-day interval", () => {
  const s = review(freshSchedule(), 4, NOW);
  assert.equal(s.repetitions, 1);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.reviews, 1);
  assert.equal(s.dueAt, NOW + 1 * DAY_MS);
  assert.equal(s.lastReviewedAt, NOW);
});

test("second successful review jumps to six days", () => {
  let s = review(freshSchedule(), 4, NOW);
  s = review(s, 4, s.dueAt!);
  assert.equal(s.repetitions, 2);
  assert.equal(s.intervalDays, 6);
});

test("third review scales the interval by the (updated) ease factor", () => {
  let s = review(freshSchedule(), 5, NOW); // rep1, interval 1
  s = review(s, 5, s.dueAt!); // rep2, interval 6
  const prevInterval = s.intervalDays; // 6
  s = review(s, 5, s.dueAt!); // rep3
  assert.equal(s.repetitions, 3);
  // The interval grows by the ease in effect AFTER this review's grade update.
  assert.equal(s.intervalDays, Math.round(prevInterval * s.ease));
});

test("a lapse (grade < 3) resets repetitions and interval but keeps lowering ease", () => {
  let s = review(freshSchedule(), 5, NOW);
  s = review(s, 5, s.dueAt!);
  s = review(s, 5, s.dueAt!); // well-learned, long interval
  assert.ok(s.repetitions >= 3);
  const easeBefore = s.ease;
  const lapsed = review(s, 1, s.dueAt!);
  assert.equal(lapsed.repetitions, 0);
  assert.equal(lapsed.intervalDays, 1);
  assert.ok(lapsed.ease < easeBefore, "ease should drop on a lapse");
  assert.ok(lapsed.ease >= MIN_EASE);
});

test("review rejects out-of-range grades", () => {
  assert.throws(() => review(freshSchedule(), 7 as unknown as 5, NOW), RangeError);
  assert.throws(() => review(freshSchedule(), -1 as unknown as 0, NOW), RangeError);
});

test("reviews counter is monotonic across grades", () => {
  let s = freshSchedule();
  for (let i = 1; i <= 5; i++) {
    s = review(s, 3, NOW + i * DAY_MS);
    assert.equal(s.reviews, i);
  }
});

test("isDue treats never-reviewed cards as due and respects dueAt otherwise", () => {
  assert.equal(isDue(freshSchedule(), NOW), true);
  const s = review(freshSchedule(), 4, NOW);
  assert.equal(isDue(s, NOW), false); // due in the future
  assert.equal(isDue(s, s.dueAt!), true); // exactly due
  assert.equal(isDue(s, s.dueAt! + 1), true); // overdue
});

test("isMastered requires several reps and a long interval", () => {
  const notYet: Schedule = { ...freshSchedule(), repetitions: 2, intervalDays: 30 };
  assert.equal(isMastered(notYet), false);
  const shortInterval: Schedule = { ...freshSchedule(), repetitions: 5, intervalDays: 10 };
  assert.equal(isMastered(shortInterval), false);
  const mastered: Schedule = { ...freshSchedule(), repetitions: 4, intervalDays: 30 };
  assert.equal(isMastered(mastered), true);
});

test("a perfect streak eventually reaches mastery", () => {
  let s = freshSchedule();
  let now = NOW;
  for (let i = 0; i < 4; i++) {
    s = review(s, 5, now);
    now = s.dueAt!;
  }
  assert.equal(isMastered(s), true);
});
