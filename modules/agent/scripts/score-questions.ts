// Score the labeled /ask questions against the live Decisions API and write each answer into the
// fixture's `observed` field, so the router test can check ROUTE_THRESHOLD offline. One request
// per question (each question is its own input). Costs a fraction of a cent. Needs OPENAI_API_KEY.
//   pnpm --filter @vintage/agent exec tsx scripts/score-questions.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { createOpenAIDecisions } from '@vintage/decisions';
import { routeRequest } from '../src/domain/router';

interface Labeled {
  question: string;
  route: string;
  observed?: { route: string | boolean | null; confidence: number };
}

const path = new URL('../tests/fixtures/questions.json', import.meta.url);
const fixture = JSON.parse(readFileSync(path, 'utf8')) as {
  $comment: string;
  questions: Labeled[];
};
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY');
const port = createOpenAIDecisions({ apiKey });

const started = Date.now();
let tokens = 0;
for (const q of fixture.questions) {
  const result = await port.ask(routeRequest(q.question, 'fixture'));
  tokens += result.usage.inputTokens;
  const answer = result.answers.route;
  q.observed =
    answer?.type === 'choice'
      ? { route: answer.choice, confidence: answer.confidence }
      : { route: null, confidence: 0 };
}
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `${fixture.questions.length} questions, ${tokens} input tokens, ${Date.now() - started} ms total`,
);
