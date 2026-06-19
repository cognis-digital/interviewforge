import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, selectStudyQueue } from "../stats.js";
import { emptyState } from "../state.js";
import { review, freshSchedule, DAY_MS } from "../sm2.js";
import type { Question, StateFile } from "../types.js";

const NOW = 1_700_000_000_000;

const bank: Question[] = [
  { id: "web-1", topic: "web", question: "q1?", answer: "a1." },
  { id: "web-2", topic: "web", question: "q2?", answer: "a2." },
  { id: "net-1", topic: "network", question: "q3?", answer: "a3." },
];

test("computeStats on an empty state marks everything new and due", () => {
  const s = computeStats(bank, emptyState(), NOW);
  assert.equal(s.total, 3);
  assert.equal(s.reviewed, 0);
  assert.equal(s.due, 3);
  assert.equal(s.mastered, 0);
  assert.equal(s.byTopic.length, 2);
});

test("computeStats counts reviewed, due, and per-topic correctly", () => {
  const state: StateFile = emptyState();
  // Review web-1 once successfully -> scheduled 1 day out (not due now).
  state.schedules["web-1"] = review(freshSchedule(), 5, NOW);
  const s = computeStats(bank, state, NOW);
  assert.equal(s.reviewed, 1);
  // web-1 is scheduled in the future; web-2 and net-1 still due.
  assert.equal(s.due, 2);
  const web = s.byTopic.find((t) => t.topic === "web")!;
  assert.equal(web.total, 2);
  assert.equal(web.reviewed, 1);
  assert.equal(web.due, 1);
});

test("byTopic is sorted by topic slug", () => {
  const s = computeStats(bank, emptyState(), NOW);
  const slugs = s.byTopic.map((t) => t.topic);
  assert.deepEqual(slugs, [...slugs].sort());
});

test("selectStudyQueue filters by topic", () => {
  const q = selectStudyQueue(bank, emptyState(), NOW, { topic: "web" });
  assert.equal(q.length, 2);
  assert.ok(q.every((x) => x.topic === "web"));
});

test("selectStudyQueue with dueOnly excludes future-scheduled cards", () => {
  const state: StateFile = emptyState();
  state.schedules["web-1"] = review(freshSchedule(), 5, NOW); // due in 1 day
  const q = selectStudyQueue(bank, state, NOW, { dueOnly: true });
  const ids = q.map((x) => x.id);
  assert.ok(!ids.includes("web-1"));
  assert.equal(q.length, 2);
});

test("selectStudyQueue surfaces never-seen cards before scheduled ones", () => {
  const state: StateFile = emptyState();
  // web-2 reviewed (scheduled in the future); web-1 and net-1 never seen.
  state.schedules["web-2"] = review(freshSchedule(), 5, NOW);
  const q = selectStudyQueue(bank, state, NOW + DAY_MS * 2, {});
  // The two unseen cards should come before the previously-scheduled one.
  assert.equal(q[q.length - 1].id, "web-2");
});

test("selectStudyQueue dueOnly + topic compose", () => {
  const state: StateFile = emptyState();
  state.schedules["web-1"] = review(freshSchedule(), 5, NOW);
  const q = selectStudyQueue(bank, state, NOW, { topic: "web", dueOnly: true });
  assert.equal(q.length, 1);
  assert.equal(q[0].id, "web-2");
});
