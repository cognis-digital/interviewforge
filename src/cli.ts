#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { loadBank, loadBuiltinBank } from "./bank.js";
import {
  loadState,
  saveState,
  getSchedule,
  DEFAULT_STATE_PATH,
} from "./state.js";
import { computeStats, selectStudyQueue } from "./stats.js";
import { review, isGrade, isDue, isMastered, type Grade } from "./sm2.js";
import type { Question } from "./types.js";
import { TOPIC_LABELS } from "./types.js";

interface Flags {
  topic?: string;
  dueOnly: boolean;
  bank?: string;
  state: string;
  limit?: number;
}

const USAGE = `interviewforge — security-interview question bank + SM-2 trainer

Usage:
  interviewforge study [--topic <t>] [--due-only] [--limit <n>] [--bank <f>] [--state <f>]
  interviewforge list  [--topic <t>] [--bank <f>]
  interviewforge stats [--bank <f>] [--state <f>]
  interviewforge add <question.json> [--bank <f>]   (validate-only; prints merged count)
  interviewforge topics
  interviewforge --help

Options:
  --topic <t>    Filter to a topic slug (network, web, ir, crypto, cloud, ...)
  --due-only     Only cards currently due for review
  --limit <n>    Cap the number of cards in a study session
  --bank <f>     Use a custom bank JSON file instead of the built-in bank
  --state <f>    Use a custom state file (default: ${DEFAULT_STATE_PATH})

License: COCL 1.0  ·  Maintainer: Cognis Digital`;

function parseFlags(args: string[]): { positionals: string[]; flags: Flags } {
  const flags: Flags = { dueOnly: false, state: DEFAULT_STATE_PATH };
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--topic":
        flags.topic = args[++i];
        break;
      case "--due-only":
        flags.dueOnly = true;
        break;
      case "--bank":
        flags.bank = args[++i];
        break;
      case "--state":
        flags.state = args[++i];
        break;
      case "--limit":
        flags.limit = Number(args[++i]);
        break;
      default:
        positionals.push(a);
    }
  }
  return { positionals, flags };
}

async function resolveBank(flags: Flags): Promise<Question[]> {
  return flags.bank ? loadBank(flags.bank) : loadBuiltinBank();
}

function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug] ?? slug;
}

function cardStatus(q: Question, sched: ReturnType<typeof getSchedule>, now: number): string {
  if (sched.reviews === 0) return "new";
  if (isMastered(sched)) return "mastered";
  if (isDue(sched, now)) return "due";
  return "scheduled";
}

async function cmdList(flags: Flags): Promise<number> {
  const bank = await resolveBank(flags);
  const filtered = flags.topic ? bank.filter((q) => q.topic === flags.topic) : bank;
  if (filtered.length === 0) {
    console.log("No questions match.");
    return 0;
  }
  for (const q of filtered) {
    const diff = q.difficulty ? ` [${q.difficulty}]` : "";
    console.log(`${q.id}  (${topicLabel(q.topic)})${diff}`);
    console.log(`    ${q.question}`);
  }
  console.log(`\n${filtered.length} question(s).`);
  return 0;
}

async function cmdStats(flags: Flags): Promise<number> {
  const bank = await resolveBank(flags);
  const state = await loadState(flags.state);
  const now = Date.now();
  const stats = computeStats(bank, state, now);

  console.log("interviewforge — progress\n");
  console.log(`  Total questions : ${stats.total}`);
  console.log(`  Reviewed        : ${stats.reviewed}`);
  console.log(`  Due today       : ${stats.due}`);
  console.log(`  Mastered        : ${stats.mastered}`);
  console.log("\n  By topic:");
  const pad = Math.max(...stats.byTopic.map((t) => topicLabel(t.topic).length), 5);
  for (const t of stats.byTopic) {
    const name = topicLabel(t.topic).padEnd(pad);
    console.log(
      `    ${name}  total ${t.total}  reviewed ${t.reviewed}  due ${t.due}  mastered ${t.mastered}`,
    );
  }
  return 0;
}

async function cmdTopics(flags: Flags): Promise<number> {
  const bank = await resolveBank(flags);
  const counts = new Map<string, number>();
  for (const q of bank) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [slug, n] of rows) {
    console.log(`  ${slug.padEnd(10)} ${topicLabel(slug).padEnd(28)} ${n}`);
  }
  return 0;
}

async function cmdAdd(positionals: string[], flags: Flags): Promise<number> {
  const file = positionals[1];
  if (!file) {
    console.error("usage: interviewforge add <question.json>");
    return 2;
  }
  const incoming = await loadBank(file);
  const base = await resolveBank(flags);
  const ids = new Set(base.map((q) => q.id));
  const dupes = incoming.filter((q) => ids.has(q.id)).map((q) => q.id);
  if (dupes.length) {
    console.error(`These ids already exist in the bank: ${dupes.join(", ")}`);
    return 1;
  }
  console.log(`Validated ${incoming.length} new question(s).`);
  console.log(
    `Merged bank would contain ${base.length + incoming.length} question(s).`,
  );
  console.log(
    "To use them, pass --bank with a combined file (the built-in bank is read-only).",
  );
  return 0;
}

/** Sentinel returned by the reader when stdin reaches end-of-input. */
const EOF = Symbol("eof");

/**
 * A line reader that decouples prompting from readline's question/close race.
 * Lines are buffered as they arrive; ask() either returns a buffered line or
 * waits for the next one, and resolves to EOF when input is exhausted.
 */
function makeReader() {
  const rl = createInterface({ input: stdin, output: stdout });
  const lines: string[] = [];
  const waiters: Array<(v: string | typeof EOF) => void> = [];
  let closed = false;

  rl.on("line", (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else lines.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()!(EOF);
  });

  return {
    ask(prompt: string): Promise<string | typeof EOF> {
      if (lines.length) return Promise.resolve(lines.shift()!);
      if (closed) return Promise.resolve(EOF);
      stdout.write(prompt);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      rl.close();
    },
  };
}

async function cmdStudy(flags: Flags): Promise<number> {
  const bank = await resolveBank(flags);
  const state = await loadState(flags.state);
  const now = Date.now();
  let queue = selectStudyQueue(bank, state, now, {
    topic: flags.topic,
    dueOnly: flags.dueOnly,
  });
  if (flags.limit && flags.limit > 0) queue = queue.slice(0, flags.limit);

  if (queue.length === 0) {
    console.log("Nothing to study. Try without --due-only, or pick another --topic.");
    return 0;
  }

  const reader = makeReader();
  let studied = 0;
  try {
    for (const q of queue) {
      console.log(`\n— ${q.id} (${topicLabel(q.topic)}) ${q.difficulty ? `[${q.difficulty}]` : ""}`);
      console.log(`Q: ${q.question}`);
      const reveal = await reader.ask("[Enter] to reveal, q to quit: ");
      if (reveal === EOF) break;
      if (reveal.trim().toLowerCase() === "q") break;
      console.log(`A: ${q.answer}`);
      let grade: number = NaN;
      let quit = false;
      while (!isGrade(grade)) {
        const raw = await reader.ask("Grade your recall 0-5 (q to quit): ");
        if (raw === EOF || raw.trim().toLowerCase() === "q") {
          quit = true;
          break;
        }
        grade = Number(raw.trim());
        if (!isGrade(grade)) console.log("Please enter an integer 0..5.");
      }
      if (quit) break;
      const reviewNow = Date.now();
      const updated = review(getSchedule(state, q.id), grade as Grade, reviewNow);
      state.schedules[q.id] = updated;
      studied++;
      const days = updated.intervalDays;
      console.log(`Next review in ${days} day${days === 1 ? "" : "s"}.`);
    }
  } finally {
    reader.close();
  }
  await saveState(flags.state, state);
  console.log(`\nSaved. Studied ${studied} card(s).`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(USAGE);
    return 0;
  }
  const { positionals, flags } = parseFlags(args);
  const command = positionals[0];

  try {
    switch (command) {
      case "study":
        return await cmdStudy(flags);
      case "list":
        return await cmdList(flags);
      case "stats":
        return await cmdStats(flags);
      case "add":
        return await cmdAdd(positionals, flags);
      case "topics":
        return await cmdTopics(flags);
      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        return 2;
    }
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    return 1;
  }
}

main(process.argv).then((code) => {
  process.exitCode = code;
});
