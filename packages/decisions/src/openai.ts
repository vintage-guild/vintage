// The OpenAI Decisions API over fetch (POST /v1/decisions). No SDK: the request is small, and a
// plain fetch runs the same in Convex actions, Node, and tests.
import type {
  Answer,
  DecisionRequest,
  DecisionResult,
  DecisionsPort,
  DecisionValue,
  Question,
} from './types';

/** The only model the endpoint accepts (2026-10). */
export const DECISIONS_MODEL = 'gpt-6-luna';

export interface OpenAIDecisionsOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class DecisionsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DecisionsError';
  }
}

type WireAnswer =
  | { type: 'predicate'; name: string | null; probability: number }
  | {
      type: 'choice';
      name: string | null;
      choice: DecisionValue;
      confidence: number;
      probabilities: { value: DecisionValue; probability: number }[];
    }
  | {
      type: 'score';
      name: string | null;
      score: number;
      confidence: number;
      probabilities: { label: string; value: number; probability: number }[];
    }
  | { type: 'refusal'; name: string | null };

interface WireDecision {
  model: string;
  answers: WireAnswer[];
  usage?: { input_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
}

function toWire(question: Question) {
  const base = { type: question.type, name: question.name, instructions: question.instructions };
  if (question.type === 'choice') return { ...base, choices: question.choices };
  if (question.type === 'score') return { ...base, levels: question.levels };
  return base;
}

/** Validate the request before it costs anything. */
export function checkRequest(request: DecisionRequest): void {
  const count = request.questions.length;
  if (count < 1 || count > 200) throw new Error(`Ask 1–200 questions, not ${count}`);
  const names = new Set<string>();
  for (const q of request.questions) {
    if (names.has(q.name)) throw new Error(`Question name "${q.name}" is used twice`);
    names.add(q.name);
    if (q.type === 'choice' && q.choices.length < 2) {
      throw new Error(`Choice question "${q.name}" needs at least two choices`);
    }
    if (q.type === 'score' && (q.levels.length < 2 || q.levels.length > 10)) {
      throw new Error(`Score question "${q.name}" needs 2–10 levels`);
    }
  }
}

/** Answers come back in question order; key them by our question names. */
export function readAnswers(questions: readonly Question[], wire: WireAnswer[]) {
  const answers: Record<string, Answer> = {};
  questions.forEach((question, i) => {
    const answer = wire[i];
    if (!answer) return;
    const name = answer.name ?? question.name;
    answers[name] = { ...answer, name } as Answer;
  });
  return answers;
}

export function createOpenAIDecisions(options: OpenAIDecisionsOptions): DecisionsPort {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  const model = options.model ?? DECISIONS_MODEL;
  return {
    async ask(request): Promise<DecisionResult> {
      checkRequest(request);
      const res = await doFetch(`${baseUrl}/decisions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: request.input,
          questions: request.questions.map(toWire),
          ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new DecisionsError(`Decisions API ${res.status}: ${text.slice(0, 300)}`, res.status);
      }
      const body = (await res.json()) as WireDecision;
      return {
        model: body.model,
        answers: readAnswers(request.questions, body.answers ?? []),
        usage: {
          inputTokens: body.usage?.input_tokens ?? 0,
          cachedTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
        },
      };
    },
  };
}
