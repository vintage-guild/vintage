// Reading answers against thresholds. Every consumer goes through these so a refusal, a missing
// answer, or a low-confidence label always reads as "no decision" and the caller falls back.
import type { Answer, DecisionResult, DecisionValue } from './types';

const answerOf = (result: DecisionResult | null, name: string): Answer | undefined =>
  result?.answers[name];

/** True only when the predicate answered at or above the threshold. */
export function predicateAtLeast(
  result: DecisionResult | null,
  name: string,
  threshold: number,
): boolean {
  const a = answerOf(result, name);
  return a?.type === 'predicate' && a.probability >= threshold;
}

/** The chosen value when its confidence reaches the threshold, else null. */
export function choiceAtLeast<T extends DecisionValue>(
  result: DecisionResult | null,
  name: string,
  threshold: number,
): T | null {
  const a = answerOf(result, name);
  return a?.type === 'choice' && a.confidence >= threshold ? (a.choice as T) : null;
}

/** The score (a level index, possibly fractional) when confident enough, else null. */
export function scoreAtLeast(
  result: DecisionResult | null,
  name: string,
  threshold: number,
): number | null {
  const a = answerOf(result, name);
  return a?.type === 'score' && a.confidence >= threshold ? a.score : null;
}
