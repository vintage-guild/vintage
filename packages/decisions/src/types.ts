// Bounded questions with typed answers (the OpenAI Decisions API's model). A module asks; the
// answer is a label plus a probability. Whether to act on it is the module's rule: compare with a
// threshold from labeled examples, and fall back to the old behavior below it or on any failure.

/** Choice values are typed: the string "true" and the boolean true are different answers. */
export type DecisionValue = string | boolean;

interface QuestionBase {
  /** Unique within one request; answers are matched by it. */
  name: string;
  /** What to decide, in plain words. */
  instructions: string;
}

/** Is a condition true? Answers a probability from 0 to 1. */
export interface PredicateQuestion extends QuestionBase {
  type: 'predicate';
}

/** Pick one of an unordered set (a department, a kind of note). */
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  choices: readonly { value: DecisionValue; description?: string }[];
}

/** Rate against 2–10 ordered levels, lowest first (severity, fit). */
export interface ScoreQuestion extends QuestionBase {
  type: 'score';
  levels: readonly { label: string; description?: string }[];
}

export type Question = PredicateQuestion | ChoiceQuestion | ScoreQuestion;

export interface PredicateAnswer {
  type: 'predicate';
  name: string;
  probability: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  name: string;
  choice: DecisionValue;
  confidence: number;
  probabilities: { value: DecisionValue; probability: number }[];
}

export interface ScoreAnswer {
  type: 'score';
  name: string;
  /** Probability-weighted level index (0 = the first level); may fall between levels. */
  score: number;
  confidence: number;
  probabilities: { label: string; value: number; probability: number }[];
}

/** The model declined this question; others in the same request may still have answers. */
export interface RefusalAnswer {
  type: 'refusal';
  name: string;
}

export type Answer = PredicateAnswer | ChoiceAnswer | ScoreAnswer | RefusalAnswer;

export interface DecisionRequest {
  /** Shared evidence for every question. Put stable text first so the prompt cache can reuse it. */
  input: string;
  /** 1–200 questions. Questions that depend on another's answer belong in a separate request. */
  questions: readonly Question[];
  /** Partitions prompt-cache reuse; pass the guild id so guilds never share a cache. */
  cacheKey?: string;
}

export interface DecisionUsage {
  inputTokens: number;
  cachedTokens: number;
}

export interface DecisionResult {
  /** Keyed by question name. */
  answers: Record<string, Answer>;
  model: string;
  usage: DecisionUsage;
}

/** The port modules depend on. apps/api wires the OpenAI adapter; tests use the scripted fake. */
export interface DecisionsPort {
  /** Throws on transport or API errors: callers must catch and fall back. */
  ask(request: DecisionRequest): Promise<DecisionResult>;
}
