import type { Member } from '@vintage/identity/contract';
import { fixedClock, makeCaller, previewAndConfirm, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import {
  buildSurveyCard,
  type PollsDeps,
  pollsCommands,
  renderSurveyInvite,
  renderSurveyReminderDm,
  surveyNonResponders,
  surveyRenderKey,
} from '../src/commands';
import { SURVEY_LIMITS, type Survey } from '../src/contract';
import { createMemoryPollsDeps } from '../src/testing';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function member(id: string, displayName: string, tier: Member['tier'], dmOptOut = false): Member {
  return {
    id,
    guildId: 'g1',
    discordId: `50000000000000000${id.slice(-1)}`,
    displayName,
    roleIds: [],
    rank: tier === 'officer' ? 'officer' : tier === 'raider' ? 'raider' : 'member',
    tier,
    inServer: true,
    prefs: { dmOptOut },
    syncedAt: NOW,
    rankSince: NOW,
  };
}

function setup() {
  const members = [
    member('m1', 'Vex', 'officer', false),
    member('m2', 'Aeryn', 'raider', false),
    member('m3', 'Cade', 'raider', true),
    member('m4', 'Pip', 'member', false),
  ];
  const deps = createMemoryPollsDeps(members);
  const clock = fixedClock(NOW);
  const registry = testRegistry<PollsDeps>(pollsCommands, clock);
  return { deps, members, clock, registry };
}

describe('surveys (v2, #65)', () => {
  it('supports survey-create|open|close|get|list|results|export and response-set with anonymity and 500-char text', async () => {
    const { deps, registry } = setup();
    const officer = makeCaller('officer', { guildId: 'g1', memberId: 'm1' });
    const aeryn = makeCaller('raider', { guildId: 'g1', memberId: 'm2' });
    const cade = makeCaller('raider', { guildId: 'g1', memberId: 'm3' });

    // Create as draft first, then open explicitly.
    const draftRes = await registry.execute(
      {
        name: 'survey-create',
        caller: officer,
        input: {
          title: 'Molten Core feedback',
          description: 'Tell us how raid night felt.',
          questions: [
            { prompt: 'Pacing?', kind: 'single', options: ['Great', 'Slow', 'Rushed'] },
            {
              prompt: 'Favorite fights?',
              kind: 'multi',
              maxChoices: 2,
              options: ['Lucifron', 'Baron', 'Rag'],
            },
            { prompt: 'Free feedback', kind: 'text', required: false },
          ],
          eligibleTier: 'raider',
          anonymous: true,
          resultsVisible: 'after-close',
          open: false,
          closesAt: NOW + 24 * HOUR,
        },
      },
      deps,
    );
    expect(draftRes.success).toBe(true);
    const survey = draftRes.data as Survey;
    expect(survey.status).toBe('draft');

    // Draft rejects responses until opened.
    const beforeOpen = await registry.execute(
      {
        name: 'response-set',
        caller: aeryn,
        input: { surveyId: survey.id, answers: [{ questionId: 'q1', choices: ['o1'] }] },
      },
      deps,
    );
    expect(beforeOpen.error?.code).toBe('SURVEY_STATUS');

    // Open survey.
    const opened = await registry.execute(
      { name: 'survey-open', caller: officer, input: { surveyId: survey.id } },
      deps,
    );
    expect(opened.success).toBe(true);
    expect(deps.pollEvents.emitted.some((e) => e.type === 'survey-opened')).toBe(true);

    // Rejects text > 500 chars.
    const tooLong = await registry.execute(
      {
        name: 'response-set',
        caller: aeryn,
        input: {
          surveyId: survey.id,
          answers: [
            { questionId: 'q1', choices: ['o1'] },
            { questionId: 'q2', choices: ['o1'] },
            { questionId: 'q3', text: 'x'.repeat(SURVEY_LIMITS.textAnswer + 1) },
          ],
        },
      },
      deps,
    );
    expect(tooLong.success).toBe(false);

    // Aeryn submits and then updates (still one response per member).
    await registry.execute(
      {
        name: 'response-set',
        caller: aeryn,
        input: {
          surveyId: survey.id,
          answers: [
            { questionId: 'q1', choices: ['o2'] },
            { questionId: 'q2', choices: ['o1', 'o3'] },
            { questionId: 'q3', text: '=SUM(A1:A2) first draft' },
          ],
        },
      },
      deps,
    );
    await registry.execute(
      {
        name: 'response-set',
        caller: aeryn,
        input: {
          surveyId: survey.id,
          answers: [
            { questionId: 'q1', choices: ['o1'] },
            { questionId: 'q2', choices: ['o1', 'o3'] },
            { questionId: 'q3', text: '=SUM(A1:A2) smooth night' },
          ],
        },
      },
      deps,
    );
    await registry.execute(
      {
        name: 'response-set',
        caller: cade,
        input: {
          surveyId: survey.id,
          answers: [
            { questionId: 'q1', choices: ['o1'] },
            { questionId: 'q2', choices: ['o3'] },
            { questionId: 'q3', text: 'More breaks please' },
          ],
        },
      },
      deps,
    );

    // Results hidden from raider while open (after-close); visible to officer without identities.
    const raiderResults = await registry.execute(
      { name: 'survey-results', caller: aeryn, input: { surveyId: survey.id } },
      deps,
    );
    expect(raiderResults.error?.code).toBe('RESULTS_HIDDEN');

    // Close with destructive preview + confirm.
    const closed = await previewAndConfirm(
      registry,
      { name: 'survey-close', caller: officer, input: { surveyId: survey.id } },
      deps,
    );
    expect(closed.preview.success).toBe(true);
    expect(closed.result.success).toBe(true);

    // After close, raider can read results and anonymity strips all member ids/names.
    const afterResults = await registry.execute(
      { name: 'survey-results', caller: aeryn, input: { surveyId: survey.id } },
      deps,
    );
    expect(afterResults.success).toBe(true);
    const resData = afterResults.data as {
      results: {
        responses: number;
        questions: (
          | {
              kind: 'text';
              answers: { text: string; memberId: string | null; displayName: string | null }[];
            }
          | { kind: 'single' | 'multi' | 'ranked'; tally: { winners: string[] } }
        )[];
      };
    };
    expect(resData.results.responses).toBe(2);
    const q1 = resData.results.questions[0]!;
    expect(q1.kind === 'single' && q1.tally.winners).toEqual(['o1']);
    const q3 = resData.results.questions[2]!;
    expect(q3.kind).toBe('text');
    if (q3.kind === 'text') {
      expect(q3.answers.every((a) => a.memberId === null && a.displayName === null)).toBe(true);
    }

    // CSV export omits member_id/display_name when anonymous and neutralizes formula prefix.
    const exported = await registry.execute(
      { name: 'survey-export', caller: officer, input: { surveyId: survey.id } },
      deps,
    );
    expect(exported.success).toBe(true);
    const csv = (exported.data as { csv: string }).csv;
    expect(csv.split('\n')[0]).toBe(
      'response_id,submitted_at,updated_at,Pacing?,Favorite fights?,Free feedback',
    );
    expect(csv).not.toContain('Aeryn');
    expect(csv).not.toContain('m2');
    expect(csv).toContain("'=SUM(A1:A2) smooth night");
    expect(csv).toContain('Lucifron; Rag');

    // survey-list hides raider surveys from member tier.
    const pip = makeCaller('member', { guildId: 'g1', memberId: 'm4' });
    const pipList = await registry.execute({ name: 'survey-list', caller: pip, input: {} }, deps);
    expect(pipList.data).toEqual([]);
  });

  it('renders Discord invite embed with link button, refreshing key, and respects DM opt-out', async () => {
    const { deps, members, registry } = setup();
    const officer = makeCaller('officer', { guildId: 'g1', memberId: 'm1' });
    const aeryn = makeCaller('raider', { guildId: 'g1', memberId: 'm2' });

    const created = await registry.execute(
      {
        name: 'survey-create',
        caller: officer,
        input: {
          title: 'Schedule check',
          questions: [{ prompt: 'Preferred start?', kind: 'single', options: ['19:00', '20:00'] }],
          eligibleTier: 'raider',
          closesAt: NOW + 12 * HOUR,
        },
      },
      deps,
    );
    const survey = created.data as Survey;

    const beforeCard = buildSurveyCard(
      survey,
      [],
      members,
      `https://vintageguild.gg/surveys/${survey.id}`,
    );
    const beforeInvite = renderSurveyInvite(beforeCard);
    expect(beforeInvite.embeds?.[0]?.title).toBe('Schedule check');
    expect(beforeInvite.embeds?.[0]?.description).toContain('**0 / 3** responded');
    expect(JSON.stringify(beforeInvite.components)).toContain(`/surveys/${survey.id}`);

    // Aeryn responds: responded count refreshes and render key changes.
    await registry.execute(
      {
        name: 'response-set',
        caller: aeryn,
        input: { surveyId: survey.id, answers: [{ questionId: 'q1', choices: ['o2'] }] },
      },
      deps,
    );
    const responses = await deps.polls.listSurveyResponses('g1', survey.id);
    const afterCard = buildSurveyCard(
      survey,
      responses,
      members,
      `https://vintageguild.gg/surveys/${survey.id}`,
    );
    expect(surveyRenderKey(afterCard)).not.toBe(surveyRenderKey(beforeCard));
    expect(renderSurveyInvite(afterCard).embeds?.[0]?.description).toContain('**1 / 3** responded');

    // Non-responders: Vex (DM ok) and Cade (dmOptOut = true).
    const nudges = surveyNonResponders(survey, responses, members);
    expect(nudges.missing.map((m) => m.displayName)).toEqual(['Vex', 'Cade']);
    expect(nudges.dmTargets.map((m) => m.displayName)).toEqual(['Vex']);
    const dm = renderSurveyReminderDm(survey, `https://vintageguild.gg/surveys/${survey.id}`);
    expect(dm.content).toContain('Schedule check');
    expect(dm.content).toContain(`/surveys/${survey.id}`);
  });
});
