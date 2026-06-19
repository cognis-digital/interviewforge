import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBank, validateQuestion } from "../bank.js";
import { loadBuiltinBank, BUILTIN_BANK_PATH } from "../bank.js";

test("normalizeBank accepts a bare array", () => {
  const qs = normalizeBank([
    { id: "a-1", topic: "web", question: "q?", answer: "a." },
  ]);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].id, "a-1");
});

test("normalizeBank accepts { questions: [...] }", () => {
  const qs = normalizeBank({
    questions: [{ id: "a-1", topic: "web", question: "q?", answer: "a." }],
  });
  assert.equal(qs.length, 1);
});

test("normalizeBank rejects malformed shapes", () => {
  assert.throws(() => normalizeBank(42 as unknown));
  assert.throws(() => normalizeBank({ nope: [] } as unknown));
  assert.throws(() => normalizeBank({ questions: "no" } as unknown));
});

test("normalizeBank rejects duplicate ids", () => {
  assert.throws(() =>
    normalizeBank([
      { id: "dup", topic: "web", question: "q1?", answer: "a1." },
      { id: "dup", topic: "web", question: "q2?", answer: "a2." },
    ]),
  );
});

test("validateQuestion enforces required string fields", () => {
  assert.throws(() => validateQuestion({}, 0));
  assert.throws(() => validateQuestion({ id: "x", topic: "t", question: "q?" }, 0));
  assert.throws(() =>
    validateQuestion({ id: "", topic: "t", question: "q?", answer: "a." }, 0),
  );
});

test("validateQuestion keeps optional difficulty and tags when valid", () => {
  const q = validateQuestion(
    {
      id: "x",
      topic: "t",
      question: "q?",
      answer: "a.",
      difficulty: "hard",
      tags: ["one", 2, "three"],
    },
    0,
  );
  assert.equal(q.difficulty, "hard");
  assert.deepEqual(q.tags, ["one", "three"]);
});

test("validateQuestion drops an invalid difficulty value", () => {
  const q = validateQuestion(
    { id: "x", topic: "t", question: "q?", answer: "a.", difficulty: "extreme" },
    0,
  );
  assert.equal(q.difficulty, undefined);
});

test("built-in bank loads, is sizeable, and is internally consistent", async () => {
  const bank = await loadBuiltinBank();
  assert.ok(bank.length >= 20, `expected >=20 questions, got ${bank.length}`);
  // unique ids
  const ids = new Set(bank.map((q) => q.id));
  assert.equal(ids.size, bank.length);
  // every question has non-trivial content
  for (const q of bank) {
    assert.ok(q.question.length > 10, `question ${q.id} too short`);
    assert.ok(q.answer.length > 30, `answer ${q.id} too short`);
  }
});

test("built-in bank covers multiple topics", async () => {
  const bank = await loadBuiltinBank();
  const topics = new Set(bank.map((q) => q.topic));
  assert.ok(topics.size >= 5, `expected >=5 topics, got ${topics.size}`);
  for (const expected of ["network", "web", "ir", "crypto", "cloud"]) {
    assert.ok(topics.has(expected), `missing topic ${expected}`);
  }
});

test("BUILTIN_BANK_PATH points at a json file", () => {
  assert.match(BUILTIN_BANK_PATH, /bank\.json$/);
});
