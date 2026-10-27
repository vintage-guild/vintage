// Label two sample applications against the live Decisions API, to check the request and see the
// raw answers next to the thresholds. Needs OPENAI_API_KEY. Not a fixture yet: no real
// applications exist (research note, open question 1).
//   pnpm --filter @vintage/applications exec tsx scripts/label-sample.ts
import { createOpenAIDecisions } from '@vintage/decisions';
import type { Application } from '../src/contract';
import { labelRequest, readLabels } from '../src/domain/labels';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY');
const port = createOpenAIDecisions({ apiKey });
const needs = [
  { wowClass: 'shaman', specs: 'restoration', need: 'high' },
  { wowClass: 'warrior', specs: 'protection', need: 'medium' },
  { wowClass: 'rogue', specs: 'any', need: 'closed' },
];
const base = {
  guildId: 'sample',
  discordId: 'd',
  applicantName: 'x',
  status: 'new',
  labels: null,
  reply: null,
  reviewedBy: null,
  reviewedAt: null,
  postChannelId: null,
  postMessageId: null,
  createdAt: 0,
  updatedAt: 0,
} as const;
const samples: Application[] = [
  {
    ...base,
    id: 'strong',
    characterName: 'Kol',
    wowClass: 'shaman',
    spec: 'restoration',
    role: 'raider',
    about: 'Been healing since vanilla, calm on comms, I read logs after every raid.',
    experience: 'Cleared MC, BWL and AQ40 on a resto shaman in 2019-2020, chain heal main.',
    availability: 'Tuesday and Thursday 8-11 server, Sundays too',
  },
  {
    ...base,
    id: 'thin',
    characterName: 'Stab',
    wowClass: 'rogue',
    spec: 'combat',
    role: 'raider',
    about: 'hi',
    experience: 'some',
    availability: 'whenever',
  },
];
for (const app of samples) {
  const result = await port.ask(labelRequest(app, needs, 'sample'));
  console.log(app.id, JSON.stringify(result.answers), '=>', JSON.stringify(readLabels(result, 0)));
}
