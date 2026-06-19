# interviewforge

A security-interview question bank with a built-in **spaced-repetition trainer**.
It ships an authored bank of original security Q&A (network, web app, incident
response, cryptography, cloud, identity, app-sec, and general concepts) and an
SM-2-style scheduler that tracks what you have reviewed and tells you what to
study next.

Everything is original, clean-room content. Educational use.

- **Maintainer:** Cognis Digital
- **License:** COCL 1.0

## Why

Studying for a security interview by re-reading the same list does not stick.
interviewforge turns the bank into flashcards on a spaced-repetition schedule:
you grade your recall 0-5 after each card, and the SM-2 algorithm decides when
to show it again, pushing well-known cards far into the future and resurfacing
shaky ones soon. State is saved to a JSON file so progress carries across
sessions.

## Install / build

Requires Node.js 20+.

```bash
npm install
npm run build
npm test
```

This compiles TypeScript (ESM) to `dist/` and runs the test suite with the
built-in Node test runner. To run the CLI from source after building:

```bash
node dist/cli.js --help
# or, once linked / installed:
interviewforge --help
```

## Usage

```
interviewforge study [--topic <t>] [--due-only] [--limit <n>] [--bank <f>] [--state <f>]
interviewforge list  [--topic <t>] [--bank <f>]
interviewforge stats [--bank <f>] [--state <f>]
interviewforge add <question.json> [--bank <f>]
interviewforge topics
interviewforge --help
```

### Study

Presents questions one at a time. Press Enter to reveal the answer, then grade
your recall from 0 (no idea) to 5 (instant, perfect). The next review date is
computed by the SM-2 scheduler and written to the state file.

```bash
interviewforge study --topic web
interviewforge study --due-only --limit 10
```

Grades, per SM-2:

| Grade | Meaning                                  |
|-------|------------------------------------------|
| 0-2   | Lapse — card resets, you will see it soon |
| 3     | Correct, but hard                         |
| 4     | Correct after some thought                |
| 5     | Perfect, effortless recall                |

### Stats

```bash
interviewforge stats
```

Shows total questions, how many you have reviewed, how many are due today, how
many are "mastered" (recalled successfully enough to earn a 3-week-plus
interval), with a per-topic breakdown.

### List & topics

```bash
interviewforge list --topic crypto
interviewforge topics
```

### Custom banks

The built-in bank is read-only. To study your own questions, point `--bank` at a
JSON file. The file may be either a bare array or `{ "questions": [ ... ] }`.
Each question:

```json
{
  "id": "web-100",
  "topic": "web",
  "question": "What is clickjacking?",
  "answer": "An attack that frames a target site invisibly ...",
  "difficulty": "medium",
  "tags": ["ui-redress"]
}
```

`interviewforge add <file.json>` validates a candidate file against the current
bank (checking shape and id collisions) and reports the merged count. To
actually study a merged set, keep your questions in one file and pass it with
`--bank`.

## How scheduling works (SM-2)

The scheduler is an original implementation of the classic SM-2 scheme and lives
in `src/sm2.ts` as a **pure function** (no clock, no I/O — the caller supplies
"now"), which is what makes it straightforward to unit-test:

- Each card carries an **ease factor** (starts at 2.5, floor 1.3), a
  **repetition count**, and an **interval** in days.
- A grade `>= 3` advances the card: interval goes 1 day, then 6 days, then
  `round(previous interval x ease)`.
- A grade `< 3` is a **lapse**: repetitions reset and the interval drops back to
  1 day, while the ease factor is still nudged down.
- The ease update is the standard
  `EF' = EF + (0.1 - (5 - q)(0.08 + (5 - q) * 0.02))`, clamped to 1.3.

## State file

By default progress is stored in `interviewforge-state.json` in the current
directory. Override with `--state <path>`. The file maps each question id to its
schedule; deleting it resets all progress. It is git-ignored by default.

## Project layout

```
src/
  cli.ts        CLI entry point and subcommands
  sm2.ts        Pure SM-2 scheduling logic (unit-tested)
  bank.ts       Bank loading + validation
  state.ts      State file load/save
  stats.ts      Stats + study-queue selection (pure)
  types.ts      Shared types
  test/         node:test suites
data/
  bank.json     Authored built-in question bank
```

## Testing

```bash
npm test
```

Tests cover the SM-2 math (ease updates, interval growth, lapses, mastery,
due-ness), bank loading and validation, and stats/queue selection. No test
relies on real interactive input — the scheduling logic is decoupled from I/O.

## License

License: COCL 1.0
