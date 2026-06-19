import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BankFile, Question } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the bundled, authored question bank (relative to dist/). */
export const BUILTIN_BANK_PATH = join(__dirname, "..", "data", "bank.json");

/** Normalize a parsed bank file into a flat question array. */
export function normalizeBank(parsed: unknown): Question[] {
  let arr: unknown;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object" && "questions" in parsed) {
    arr = (parsed as { questions: unknown }).questions;
  } else {
    throw new Error("bank must be an array or an object with a `questions` array");
  }

  if (!Array.isArray(arr)) {
    throw new Error("`questions` must be an array");
  }

  const seen = new Set<string>();
  const out: Question[] = [];
  for (const [i, raw] of arr.entries()) {
    const q = validateQuestion(raw, i);
    if (seen.has(q.id)) {
      throw new Error(`duplicate question id "${q.id}"`);
    }
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

/** Validate a single question object, throwing on malformed input. */
export function validateQuestion(raw: unknown, index: number): Question {
  if (!raw || typeof raw !== "object") {
    throw new Error(`question at index ${index} is not an object`);
  }
  const r = raw as Record<string, unknown>;
  for (const field of ["id", "topic", "question", "answer"] as const) {
    if (typeof r[field] !== "string" || (r[field] as string).trim() === "") {
      throw new Error(`question at index ${index} missing string field "${field}"`);
    }
  }
  const q: Question = {
    id: r.id as string,
    topic: r.topic as string,
    question: r.question as string,
    answer: r.answer as string,
  };
  if (r.difficulty === "easy" || r.difficulty === "medium" || r.difficulty === "hard") {
    q.difficulty = r.difficulty;
  }
  if (Array.isArray(r.tags)) {
    q.tags = r.tags.filter((t): t is string => typeof t === "string");
  }
  return q;
}

/** Load and validate a bank from disk. */
export async function loadBank(path: string): Promise<Question[]> {
  const text = await readFile(path, "utf8");
  let parsed: BankFile;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`bank file ${path} is not valid JSON: ${(e as Error).message}`);
  }
  return normalizeBank(parsed);
}

/** Load the bundled built-in bank. */
export function loadBuiltinBank(): Promise<Question[]> {
  return loadBank(BUILTIN_BANK_PATH);
}
