import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { StateFile } from "./types.js";
import { freshSchedule, type Schedule } from "./sm2.js";

/** Default state file location (in the current working directory). */
export const DEFAULT_STATE_PATH = "interviewforge-state.json";

/** An empty, valid state file. */
export function emptyState(): StateFile {
  return { version: 1, schedules: {} };
}

/** Parse and migrate a raw state object. */
export function normalizeState(parsed: unknown): StateFile {
  if (!parsed || typeof parsed !== "object") return emptyState();
  const p = parsed as Record<string, unknown>;
  const schedules =
    p.schedules && typeof p.schedules === "object"
      ? (p.schedules as Record<string, Schedule>)
      : {};
  return { version: 1, schedules };
}

/** Load state from disk; returns an empty state if the file is missing. */
export async function loadState(path: string): Promise<StateFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw e;
  }
  try {
    return normalizeState(JSON.parse(text));
  } catch {
    // Corrupt state should not be fatal; start clean rather than crash.
    return emptyState();
  }
}

/** Persist state to disk, creating parent directories as needed. */
export async function saveState(path: string, state: StateFile): Promise<void> {
  const dir = dirname(path);
  if (dir && dir !== ".") {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Get the schedule for a question id, creating a fresh one if absent. */
export function getSchedule(state: StateFile, id: string): Schedule {
  return state.schedules[id] ?? freshSchedule();
}
