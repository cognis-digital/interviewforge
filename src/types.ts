import type { Schedule } from "./sm2.js";

/** A single authored interview question. */
export interface Question {
  /** Stable unique id, e.g. "web-001". */
  id: string;
  /** Topic slug, e.g. "web", "network", "ir", "crypto", "cloud". */
  topic: string;
  /** The interview prompt. */
  question: string;
  /** The model answer / talking points. */
  answer: string;
  /** Optional difficulty tag. */
  difficulty?: "easy" | "medium" | "hard";
  /** Optional free-form tags. */
  tags?: string[];
}

/** A question bank as loaded from JSON (an array, or { questions: [...] }). */
export type BankFile = Question[] | { questions: Question[] };

/** Persisted per-question scheduling, keyed by question id. */
export interface StateFile {
  /** Schema version for forward-compat. */
  version: 1;
  /** Map of question id -> schedule. */
  schedules: Record<string, Schedule>;
}

/** Human-readable topic names for display. */
export const TOPIC_LABELS: Record<string, string> = {
  network: "Network Security",
  web: "Web Application Security",
  ir: "Incident Response",
  crypto: "Cryptography Basics",
  cloud: "Cloud Security",
  appsec: "Application Security & SDLC",
  identity: "Identity & Access Management",
  general: "General / Concepts",
};
