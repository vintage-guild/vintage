import { createFakeDecisions } from '@vintage/decisions/testing';
import { describe, expect, it } from 'vitest';
import {
  decideRoute,
  ROUTE_REPLIES,
  ROUTE_THRESHOLD,
  routeQuestion,
  routeRequest,
} from '../src/domain/router';
import fixture from './fixtures/questions.json';

describe('router threshold (labeled fixture, scored live)', () => {
  const scored = fixture.questions.filter((q) => q.observed);

  it('turns away no question that should reach the agent', () => {
    expect(scored).toHaveLength(fixture.questions.length);
    const refusable = new Set(['off-topic', 'officer-action']);
    const wronglyRefused = scored.filter(
      (q) =>
        q.observed!.confidence >= ROUTE_THRESHOLD &&
        refusable.has(String(q.observed!.route)) &&
        q.observed!.route !== q.route,
    );
    expect(wronglyRefused).toEqual([]);
  });

  it('routes most questions confidently', () => {
    const confident = scored.filter((q) => q.observed!.confidence >= ROUTE_THRESHOLD);
    expect(confident.length / scored.length).toBeGreaterThanOrEqual(0.85);
  });
});

describe('decideRoute', () => {
  const result = (route: string, confidence = 0.95) => ({
    model: 'fake',
    usage: { inputTokens: 1, cachedTokens: 0 },
    answers: {
      route: {
        type: 'choice' as const,
        name: 'route',
        choice: route,
        confidence,
        probabilities: [],
      },
    },
  });

  it('answers off-topic questions without the agent', () => {
    expect(decideRoute(result('off-topic'), 'raider')).toEqual({
      label: 'off-topic',
      reply: ROUTE_REPLIES['off-topic'],
    });
  });

  it('turns officer actions away below leader, and lets leaders through', () => {
    expect(decideRoute(result('officer-action'), 'raider').reply).toBe(
      ROUTE_REPLIES['officer-action'],
    );
    expect(decideRoute(result('officer-action'), 'leader')).toEqual({
      label: 'officer-action',
      reply: null,
    });
  });

  it('fails open below the threshold and on no answer', () => {
    expect(decideRoute(result('off-topic', 0.6), 'raider')).toEqual({ label: null, reply: null });
    expect(decideRoute(null, 'raider')).toEqual({ label: null, reply: null });
  });
});

describe('routeQuestion', () => {
  it('sends the question as the input and fails open on errors', async () => {
    const fake = createFakeDecisions({ route: { choice: 'guild-question' } });
    expect(await routeQuestion(fake, 'when is raid?', 'raider', 'g')).toEqual({
      label: 'guild-question',
      reply: null,
    });
    expect(fake.requests[0]?.input).toContain('when is raid?');
    expect(routeRequest('x', 'g').questions).toHaveLength(1);
    fake.failNext();
    expect(await routeQuestion(fake, 'q', 'raider', 'g')).toEqual({ label: null, reply: null });
    expect(await routeQuestion(null, 'q', 'raider', 'g')).toEqual({ label: null, reply: null });
  });
});
