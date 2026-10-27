// A scripted DecisionsPort for tests: answer by question name, record every request, and fail on
// demand so consumers can prove their fallback.
import { checkRequest } from './openai';
import type {
  Answer,
  DecisionRequest,
  DecisionResult,
  DecisionsPort,
  DecisionValue,
} from './types';

/** How the fake answers one question, given the request's input. */
export type ScriptedAnswer =
  | { predicate: number }
  | { choice: DecisionValue; confidence?: number }
  | { score: number; confidence?: number }
  | 'refuse';

export type Script = Record<string, ScriptedAnswer | ((input: string) => ScriptedAnswer)>;

function toAnswer(name: string, scripted: ScriptedAnswer): Answer {
  if (scripted === 'refuse') return { type: 'refusal', name };
  if ('predicate' in scripted) {
    return { type: 'predicate', name, probability: scripted.predicate };
  }
  if ('choice' in scripted) {
    const confidence = scripted.confidence ?? 0.95;
    return {
      type: 'choice',
      name,
      choice: scripted.choice,
      confidence,
      probabilities: [{ value: scripted.choice, probability: confidence }],
    };
  }
  const confidence = scripted.confidence ?? 0.9;
  return { type: 'score', name, score: scripted.score, confidence, probabilities: [] };
}

export interface FakeDecisions extends DecisionsPort {
  requests: DecisionRequest[];
  /** Make the next `count` calls throw, to exercise fallbacks. */
  failNext(count?: number): void;
}

/** Questions without a script entry come back as refusals. */
export function createFakeDecisions(script: Script = {}): FakeDecisions {
  const requests: DecisionRequest[] = [];
  let failures = 0;
  return {
    requests,
    failNext(count = 1) {
      failures += count;
    },
    async ask(request): Promise<DecisionResult> {
      checkRequest(request);
      requests.push(structuredClone(request));
      if (failures > 0) {
        failures--;
        throw new Error('fake Decisions failure');
      }
      const answers: Record<string, Answer> = {};
      for (const q of request.questions) {
        const entry = script[q.name];
        const scripted = typeof entry === 'function' ? entry(request.input) : entry;
        answers[q.name] = toAnswer(q.name, scripted ?? 'refuse');
      }
      return {
        model: 'fake',
        answers,
        usage: { inputTokens: request.input.length, cachedTokens: 0 },
      };
    },
  };
}
