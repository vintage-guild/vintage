// Which findings reach a raider's DMs (#137). The findings are code; a Decisions question checks
// that each one reads as help rather than nagging before it is sent, and the agent may word the
// DM. Below the threshold, or on any failure, the finding is still sent as written: the gate only
// drops findings the model is confident are not useful, and only if a better one remains.
import type { DecisionRequest, DecisionResult, DecisionsPort } from '@vintage/decisions';
import type { InsightFinding } from '../contract';

/** A finding the model is at least this sure is not useful is dropped. */
export const DROP_THRESHOLD = 0.8;
/** At most this many findings per raider per run. */
export const MAX_PER_RAIDER = 2;

export function gateRequest(
  findings: readonly InsightFinding[],
  cacheKey: string,
): DecisionRequest {
  return {
    input: [
      'Notes for one World of Warcraft raider about their own play in one raid, from the combat log:',
      ...findings.map((f, i) => `${i + 1}. ${f.text} (${f.evidence})`),
    ].join('\n'),
    cacheKey,
    questions: findings.map((_f, i) => ({
      type: 'predicate' as const,
      name: `useless_${i}`,
      instructions: `Is note ${i + 1} unhelpful: vague, or something the raider cannot act on?`,
    })),
  };
}

/** The findings to send, heaviest first: confident "unhelpful" ones drop, never all of them. */
export function pickFindings(
  findings: readonly InsightFinding[],
  result: DecisionResult | null,
): InsightFinding[] {
  const useless = (i: number) => {
    const a = result?.answers[`useless_${i}`];
    return a?.type === 'predicate' && a.probability >= DROP_THRESHOLD;
  };
  const kept = findings.filter((_f, i) => !useless(i));
  return [...(kept.length ? kept : findings)]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_PER_RAIDER);
}

export async function gateFindings(
  decisions: DecisionsPort | null | undefined,
  findings: readonly InsightFinding[],
  cacheKey: string,
): Promise<InsightFinding[]> {
  if (!findings.length) return [];
  if (!decisions) return pickFindings(findings, null);
  try {
    return pickFindings(findings, await decisions.ask(gateRequest(findings, cacheKey)));
  } catch {
    return pickFindings(findings, null);
  }
}

export const DM_INSTRUCTIONS = [
  "You write the opening of a short private note to a World of Warcraft raider from their guild's assistant.",
  'The notes below are sent right after your words, exactly as written, so do not repeat them, their numbers, or their times. In one or two friendly sentences, say which of them is most worth working on next raid and why it helps. Do not compare them to anyone, do not scold, add nothing that is not in the notes, and do not say how to turn these messages off. No greeting, no sign-off.',
].join('\n');

/** The DM without the agent: the findings as written, with their evidence. */
export function plainDm(zoneName: string, findings: readonly InsightFinding[]): string {
  return [
    `From the ${zoneName} log:`,
    ...findings.map((f) => `• ${f.text} (${f.evidence})`),
    '-# To stop these notes, use `/random ask` and say "stop my raid notes".',
  ].join('\n');
}
