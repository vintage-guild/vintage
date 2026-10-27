// The /ask intent router (#133): one Decisions question before a session opens. Off-topic
// questions, and officer actions asked by someone who isn't a leader, get a short reply without
// spending an agent turn. Tier enforcement stays in guild-kit; this only saves turns. It fails
// open: below the threshold or on any failure the question goes to the agent. The label is kept
// on the run for the ledger.

import {
  choiceAtLeast,
  type DecisionRequest,
  type DecisionResult,
  type DecisionsPort,
} from '@vintage/decisions';
import { type Tier, tierAllows } from '@vintage/guild-kit';

export const ROUTES = ['guild-question', 'own-change', 'officer-action', 'off-topic'] as const;
export type Route = (typeof ROUTES)[number];

/**
 * From the labeled questions in tests/fixtures/questions.json, scored live on 2026-10-27: at 0.8,
 * 27 of 30 route confidently and nothing that should reach the agent is turned away. At 0.6 a WoW
 * gearing question (0.61 off-topic) would be refused. The test re-checks this.
 */
export const ROUTE_THRESHOLD = 0.8;

export const ROUTE_REPLIES = {
  'off-topic':
    'I can only help with Vintage guild things: raids and signups, the roster, polls, recruiting, and your characters.',
  'officer-action':
    'That needs a raid leader or an officer. Ask one of them, or ask me what you can do yourself.',
} as const;

export function routeRequest(question: string, cacheKey: string): DecisionRequest {
  return {
    input: `A member of a World of Warcraft guild asked the guild's assistant:\n\n${question}`,
    cacheKey,
    questions: [
      {
        type: 'choice',
        name: 'route',
        instructions: 'What kind of request is this?',
        choices: [
          {
            value: 'guild-question',
            description:
              'A question about the guild: raids, schedules, signups, the roster, polls, recruiting, characters, rules',
          },
          {
            value: 'own-change',
            description:
              'Asks to change something of their own: their signup, characters, preferences, a vote',
          },
          {
            value: 'officer-action',
            description:
              'Asks to change something for others or the guild: lock or edit the roster, bench or move people, create or cancel raids, recruiting, guild settings',
          },
          {
            value: 'off-topic',
            description:
              'Not about the guild at all: general chat, trivia, homework, other games, coding',
          },
        ],
      },
    ],
  };
}

export interface RouteDecision {
  /** The confident route, or null. */
  label: Route | null;
  /** A reply that answers the question without the agent, or null to ask the agent. */
  reply: string | null;
}

export function decideRoute(result: DecisionResult | null, tier: Tier): RouteDecision {
  const label = choiceAtLeast<Route>(result, 'route', ROUTE_THRESHOLD);
  if (label === 'off-topic') return { label, reply: ROUTE_REPLIES['off-topic'] };
  if (label === 'officer-action' && !tierAllows(tier, 'leader')) {
    return { label, reply: ROUTE_REPLIES['officer-action'] };
  }
  return { label, reply: null };
}

/** Route one question; any failure sends it to the agent. */
export async function routeQuestion(
  decisions: DecisionsPort | null | undefined,
  question: string,
  tier: Tier,
  cacheKey: string,
): Promise<RouteDecision> {
  if (!decisions) return { label: null, reply: null };
  try {
    return decideRoute(await decisions.ask(routeRequest(question, cacheKey)), tier);
  } catch {
    return { label: null, reply: null };
  }
}
