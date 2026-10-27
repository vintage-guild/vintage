import { describe, expect, it } from 'vitest';
import {
  choiceAccuracy,
  choiceAtLeast,
  createOpenAIDecisions,
  DecisionRefused,
  type DecisionRequest,
  pickThreshold,
  predicateAtLeast,
  scoreAtLeast,
  withLedger,
} from '../src/index';
import { createFakeDecisions } from '../src/testing';

const request: DecisionRequest = {
  input: 'running about 20 min late, work ran over',
  cacheKey: 'guild-1',
  questions: [
    {
      type: 'choice',
      name: 'kind',
      instructions: 'What is the note about?',
      choices: [{ value: 'late' }, { value: 'question' }],
    },
    { type: 'predicate', name: 'needs_officer', instructions: 'Does it need an officer?' },
  ],
};

// The wire answer recorded in the 2026-10-26 spike (#128), trimmed.
const wire = {
  model: 'gpt-6-luna',
  answers: [
    {
      type: 'choice',
      name: 'kind',
      choice: 'late',
      confidence: 0.99,
      probabilities: [
        { value: 'late', probability: 0.99 },
        { value: 'question', probability: 0 },
      ],
    },
    { type: 'predicate', name: 'needs_officer', probability: 0 },
  ],
  usage: { input_tokens: 301, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
};

describe('createOpenAIDecisions', () => {
  it('posts the request in the API shape and keys answers by question name', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const port = createOpenAIDecisions({
      apiKey: 'sk-test',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(wire), { status: 200 });
      }) as typeof fetch,
    });
    const result = await port.ask(request);

    expect(calls[0]?.url).toBe('https://api.openai.com/v1/decisions');
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({ model: 'gpt-6-luna', prompt_cache_key: 'guild-1' });
    expect(body.questions[0]).toEqual({
      type: 'choice',
      name: 'kind',
      instructions: 'What is the note about?',
      choices: [{ value: 'late' }, { value: 'question' }],
    });
    expect(result.answers.kind).toMatchObject({ type: 'choice', choice: 'late' });
    expect(result.answers.needs_officer).toMatchObject({ type: 'predicate', probability: 0 });
    expect(result.usage).toEqual({ inputTokens: 301, cachedTokens: 0 });
  });

  it('throws on an API error so the caller falls back', async () => {
    const port = createOpenAIDecisions({
      apiKey: 'sk-test',
      fetch: (async () => new Response('{"error":"nope"}', { status: 429 })) as typeof fetch,
    });
    await expect(port.ask(request)).rejects.toThrow(/429/);
  });

  it('refuses bad requests before calling the API', async () => {
    const port = createOpenAIDecisions({
      apiKey: 'sk-test',
      fetch: (async () => {
        throw new Error('should not be called');
      }) as typeof fetch,
    });
    await expect(
      port.ask({ ...request, questions: [request.questions[1]!, request.questions[1]!] }),
    ).rejects.toThrow(/used twice/);
  });
});

describe('reading answers', () => {
  it('treats refusals and low confidence as no decision', async () => {
    const fake = createFakeDecisions({
      kind: { choice: 'late', confidence: 0.6 },
      needs_officer: 'refuse',
    });
    const result = await fake.ask(request);
    expect(choiceAtLeast(result, 'kind', 0.8)).toBeNull();
    expect(choiceAtLeast(result, 'kind', 0.5)).toBe('late');
    expect(predicateAtLeast(result, 'needs_officer', 0)).toBe(false);
    expect(predicateAtLeast(null, 'needs_officer', 0)).toBe(false);
    expect(scoreAtLeast(result, 'kind', 0)).toBeNull();
  });

  it('fails on demand', async () => {
    const fake = createFakeDecisions();
    fake.failNext();
    await expect(fake.ask(request)).rejects.toThrow();
    await expect(fake.ask(request)).resolves.toBeTruthy();
    // Failed attempts are recorded too, so tests can see that a fallback really asked first.
    expect(fake.requests).toHaveLength(2);
  });
});

describe('withLedger', () => {
  it('records each call and refuses when the ledger says no', async () => {
    const entries: unknown[] = [];
    let refusal: string | null = null;
    const fake = createFakeDecisions({ kind: { choice: 'late' } });
    const port = withLedger(fake, {
      refuse: async () => refusal,
      record: async (entry) => {
        entries.push(entry);
      },
    });
    await port.ask(request);
    fake.failNext();
    await expect(port.ask(request)).rejects.toThrow('fake Decisions failure');
    refusal = 'paused';
    await expect(port.ask(request)).rejects.toBeInstanceOf(DecisionRefused);
    expect(entries).toEqual([
      { inputTokens: request.input.length, model: 'fake', error: null },
      { inputTokens: null, model: null, error: 'fake Decisions failure' },
    ]);
    expect(fake.requests).toHaveLength(2);
  });
});

describe('thresholds', () => {
  it('picks the lowest threshold with no false positives', () => {
    const report = pickThreshold([
      { probability: 0.95, truth: true },
      { probability: 0.7, truth: true },
      { probability: 0.65, truth: false },
      { probability: 0.1, truth: false },
    ]);
    expect(report.threshold).toBe(0.66);
    expect(report.falsePositives).toBe(0);
    expect(report.recall).toBe(1);
  });

  it('scores choice accuracy above a confidence floor', () => {
    expect(
      choiceAccuracy(
        [
          { choice: 'late', confidence: 0.99, truth: 'late' },
          { choice: 'other', confidence: 0.4, truth: 'question' },
          { choice: 'tentative', confidence: 0.9, truth: 'late' },
        ],
        0.5,
      ),
    ).toEqual({ accuracy: 0.5, answered: 2, abstained: 1 });
  });
});
