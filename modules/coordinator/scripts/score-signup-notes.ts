// Score the labeled signup notes against the live Decisions API and write the probabilities into
// the fixture's `observed` fields, so the threshold test can check NOTE_THRESHOLDS offline.
// Costs a fraction of a cent. Needs OPENAI_API_KEY.
//   pnpm --filter @vintage/coordinator exec tsx scripts/score-signup-notes.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { createOpenAIDecisions } from '@vintage/decisions';
import { noteTriageRequest } from '../src/domain/notes';

interface Labeled {
  note: string;
  kind: string;
  needsOfficer: boolean;
  observed?: { kind: string | boolean | null; kindConfidence: number; needsOfficer: number };
}

const path = new URL('../tests/fixtures/signup-notes.json', import.meta.url);
const fixture = JSON.parse(readFileSync(path, 'utf8')) as { $comment: string; notes: Labeled[] };
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY');

const inputs = fixture.notes.map((n, i) => ({
  id: String(i),
  who: `Member${i + 1}`,
  note: n.note,
}));
const started = Date.now();
const result = await createOpenAIDecisions({ apiKey }).ask(noteTriageRequest(inputs, 'fixture'));
const ms = Date.now() - started;

fixture.notes.forEach((n, i) => {
  const kind = result.answers[`kind_${i}`];
  const officer = result.answers[`officer_${i}`];
  n.observed = {
    kind: kind?.type === 'choice' ? kind.choice : null,
    kindConfidence: kind?.type === 'choice' ? kind.confidence : 0,
    needsOfficer: officer?.type === 'predicate' ? officer.probability : 0,
  };
});
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `${fixture.notes.length} notes, ${result.usage.inputTokens} input tokens, ${ms} ms, model ${result.model}`,
);
