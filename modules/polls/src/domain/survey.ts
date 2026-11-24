// Pure survey domain logic (#65): composes polls' `tally()` for choice questions, preserves
// anonymity on results and CSV exports, and computes non-responders respecting DM opt-out.
import { tierAllows } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type {
  Poll,
  Survey,
  SurveyQuestion,
  SurveyQuestionResults,
  SurveyResponse,
  SurveyResults,
  Vote,
} from '../contract';
import { tally } from './tally';

function choicePollFor(survey: Survey, q: SurveyQuestion): Poll {
  return {
    id: `${survey.id}:${q.id}`,
    guildId: survey.guildId,
    question: q.prompt,
    description: null,
    options: q.options,
    method: q.kind === 'text' ? 'single' : q.kind,
    maxChoices: q.maxChoices,
    eligibleTier: survey.eligibleTier,
    anonymous: survey.anonymous,
    resultsVisible: survey.resultsVisible,
    quorum: null,
    status: survey.status,
    opensAt: survey.opensAt,
    closesAt: survey.closesAt,
    createdBy: survey.createdBy,
    closedBy: survey.closedBy,
    createdAt: survey.createdAt,
    closedAt: survey.closedAt,
    tags: survey.tags,
    configVersion: survey.configVersion,
    results: null,
  };
}

function tallyQuestion(
  survey: Survey,
  question: SurveyQuestion,
  responses: readonly SurveyResponse[],
  names: ReadonlyMap<string, string>,
): SurveyQuestionResults {
  if (question.kind === 'text') {
    const answers = responses
      .map((r) => {
        const answer = r.answers.find((a) => a.questionId === question.id);
        const text = answer?.text?.trim() ?? '';
        if (!text) return null;
        return {
          text,
          memberId: survey.anonymous ? null : r.memberId,
          displayName: survey.anonymous ? null : (names.get(r.memberId) ?? null),
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    return {
      questionId: question.id,
      prompt: question.prompt,
      kind: 'text',
      responses: answers.length,
      answers,
    };
  }

  const votes: Vote[] = responses.flatMap((r) => {
    const answer = r.answers.find((a) => a.questionId === question.id);
    if (!answer || answer.choices.length === 0) return [];
    return [
      {
        id: `${r.id}:${question.id}`,
        guildId: r.guildId,
        pollId: `${survey.id}:${question.id}`,
        memberId: r.memberId,
        choices: answer.choices,
        weight: 1,
        castAt: r.submittedAt,
        updatedAt: r.updatedAt,
      },
    ];
  });
  return {
    questionId: question.id,
    prompt: question.prompt,
    kind: question.kind,
    tally: tally(choicePollFor(survey, question), votes),
  };
}

/** Tally a survey's responses. Choice questions reuse `tally()`; anonymous strips all identities. */
export function tallySurvey(
  survey: Survey,
  responses: readonly SurveyResponse[],
  names: ReadonlyMap<string, string> = new Map(),
): SurveyResults {
  return {
    responses: responses.length,
    questions: survey.questions.map((q) => tallyQuestion(survey, q, responses, names)),
  };
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180 CSV cell escaping with spreadsheet formula neutralization for user-supplied text. */
function csvCell(value: string, neutralizeFormula = false): string {
  const safe = neutralizeFormula && FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function formatAnswerForCsv(
  question: SurveyQuestion,
  response: SurveyResponse,
): { value: string; userText: boolean } {
  const answer = response.answers.find((a) => a.questionId === question.id);
  if (!answer) return { value: '', userText: false };
  if (question.kind === 'text') return { value: answer.text ?? '', userText: true };
  const labelById = new Map(question.options.map((o) => [o.id, o.label]));
  return {
    value: answer.choices.map((id) => labelById.get(id) ?? id).join('; '),
    userText: false,
  };
}

/** Export survey responses as RFC 4180 CSV. Anonymous surveys omit respondent identity columns. */
export function exportSurveyCsv(
  survey: Survey,
  responses: readonly SurveyResponse[],
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const idHeaders = survey.anonymous
    ? ['response_id', 'submitted_at', 'updated_at']
    : ['member_id', 'display_name', 'submitted_at', 'updated_at'];
  const header = [...idHeaders, ...survey.questions.map((q) => q.prompt)].map((h) => csvCell(h));
  const rows = [header.join(',')];

  for (const r of responses) {
    const idCells = survey.anonymous
      ? [
          csvCell(r.id),
          csvCell(new Date(r.submittedAt).toISOString()),
          csvCell(new Date(r.updatedAt).toISOString()),
        ]
      : [
          csvCell(r.memberId),
          csvCell(names.get(r.memberId) ?? '', true),
          csvCell(new Date(r.submittedAt).toISOString()),
          csvCell(new Date(r.updatedAt).toISOString()),
        ];
    const answerCells = survey.questions.map((q) => {
      const { value, userText } = formatAnswerForCsv(q, r);
      return csvCell(value, userText);
    });
    rows.push([...idCells, ...answerCells].join(','));
  }

  return rows.join('\n');
}

/** Eligible guild members who haven't answered yet, plus the subset who allow reminder DMs. */
export function surveyNonResponders(
  survey: Pick<Survey, 'eligibleTier'>,
  responses: readonly Pick<SurveyResponse, 'memberId'>[],
  members: readonly Member[],
): { eligible: Member[]; missing: Member[]; dmTargets: Member[] } {
  const answered = new Set(responses.map((r) => r.memberId));
  const eligible = members.filter((m) => m.inServer && tierAllows(m.tier, survey.eligibleTier));
  const missing = eligible.filter((m) => !answered.has(m.id));
  const dmTargets = missing.filter((m) => !m.prefs.dmOptOut);
  return { eligible, missing, dmTargets };
}
