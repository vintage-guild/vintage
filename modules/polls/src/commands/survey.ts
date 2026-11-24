// Survey commands (#65): survey-create|open|close|get|list|results|export and response-set.
// Surveys compose polls' tally and visibility/anonymity rules rather than creating a second voting
// path; answering happens on the website while Discord handles invites and non-responder nudges.
import { type Caller, error, success, type Tier, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  POLL_LIMITS,
  POLL_STATUSES,
  RESULTS_VISIBILITY,
  SURVEY_LIMITS,
  SURVEY_QUESTION_KINDS,
  type Survey,
  type SurveyAnswer,
  type SurveyQuestion,
  type SurveyResults,
} from '../contract';
import { exportSurveyCsv, tallySurvey } from '../domain/survey';
import { command, type PollsDeps } from '../store';
import {
  actorOf,
  eligibleTierSchema,
  instantSchema,
  isOfficer,
  notSignedIn,
  optionInputSchema,
  tagsSchema,
} from './shared';

const invalid = (code: string, message: string, suggestion: string) =>
  error(code, message, { suggestion, retryable: false });

const surveyNotFound = () =>
  invalid('SURVEY_NOT_FOUND', 'No such survey', 'Use survey-list to find the survey id');

const canSeeSurvey = (caller: Caller, survey: Survey) =>
  tierAllows(caller.tier, survey.eligibleTier);

function canSeeSurveyResults(caller: Caller, survey: Survey): boolean {
  if (isOfficer(caller)) return true;
  if (survey.status === 'closed') return survey.resultsVisible !== 'officers';
  return survey.status === 'open' && survey.resultsVisible === 'live';
}

export interface SurveyView extends Omit<Survey, 'results'> {
  results: SurveyResults | null;
  resultsHidden: boolean;
}

function surveyViewOf(caller: Caller, survey: Survey, live?: SurveyResults): SurveyView {
  const visible = canSeeSurveyResults(caller, survey);
  const results = survey.status === 'closed' ? survey.results : (live ?? null);
  return { ...survey, results: visible ? results : null, resultsHidden: !visible };
}

async function memberNameMap(deps: PollsDeps, guildId: string): Promise<Map<string, string>> {
  const members = await deps.pollMembers.listMembers(guildId);
  return new Map(members.map((m) => [m.id, m.displayName]));
}

export async function openSurvey(deps: PollsDeps, survey: Survey, at: number): Promise<Survey> {
  const opened = await deps.polls.updateSurvey(survey.guildId, survey.id, {
    status: 'open',
    opensAt: survey.opensAt ?? at,
  });
  await deps.pollEvents.emit(survey.guildId, 'survey-opened', {
    surveyId: opened.id,
    title: opened.title,
    closesAt: opened.closesAt,
    eligibleTier: opened.eligibleTier,
    tags: opened.tags,
  });
  return opened;
}

export async function closeSurvey(
  deps: PollsDeps,
  survey: Survey,
  at: number,
  closedBy: string | null,
): Promise<{ survey: Survey; results: SurveyResults }> {
  const [responses, names] = await Promise.all([
    deps.polls.listSurveyResponses(survey.guildId, survey.id),
    survey.anonymous
      ? Promise.resolve(new Map<string, string>())
      : memberNameMap(deps, survey.guildId),
  ]);
  const results = tallySurvey(survey, responses, names);
  const closed = await deps.polls.updateSurvey(survey.guildId, survey.id, {
    status: 'closed',
    results,
    closedBy,
    closedAt: at,
  });
  await deps.pollEvents.emit(survey.guildId, 'survey-closed', {
    surveyId: survey.id,
    tags: survey.tags,
    results,
  });
  return { survey: closed, results };
}

const rawQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(SURVEY_LIMITS.prompt),
  kind: z.enum(SURVEY_QUESTION_KINDS).default('single'),
  required: z.boolean().default(true),
  options: z.array(optionInputSchema).max(POLL_LIMITS.maxOptions).optional(),
  maxChoices: z.number().int().min(1).max(POLL_LIMITS.maxOptions).nullable().optional(),
});

type RawQuestion = z.infer<typeof rawQuestionSchema>;

function buildTextQuestion(
  q: RawQuestion,
  num: number,
): { question: SurveyQuestion } | { failure: ReturnType<typeof error> } {
  if (q.options?.length) {
    return {
      failure: invalid(
        'INVALID_QUESTION',
        `Question ${num} is free text and cannot have options`,
        'Drop options on text questions',
      ),
    };
  }
  if (q.maxChoices !== undefined && q.maxChoices !== null) {
    return {
      failure: invalid(
        'INVALID_QUESTION',
        `Question ${num} is free text and cannot set maxChoices`,
        'Drop maxChoices on text questions',
      ),
    };
  }
  return {
    question: {
      id: `q${num}`,
      prompt: q.prompt,
      kind: 'text',
      required: q.required,
      options: [],
      maxChoices: null,
    },
  };
}

function buildChoiceQuestion(
  q: RawQuestion,
  num: number,
): { question: SurveyQuestion } | { failure: ReturnType<typeof error> } {
  const opts = q.options ?? [];
  if (opts.length < POLL_LIMITS.minOptions) {
    return {
      failure: invalid(
        'INVALID_QUESTION',
        `Question ${num} needs at least ${POLL_LIMITS.minOptions} options`,
        'Provide 2–25 unique options for choice questions',
      ),
    };
  }
  const normalized = opts.map((o, idx) => {
    const entry = typeof o === 'string' ? { label: o } : o;
    return {
      id: `o${idx + 1}`,
      label: entry.label,
      emoji: entry.emoji ?? null,
      value: entry.value ?? null,
    };
  });
  if (new Set(normalized.map((o) => o.label.toLowerCase())).size !== normalized.length) {
    return {
      failure: invalid(
        'INVALID_QUESTION',
        `Question ${num} has duplicate option labels`,
        'Make every option label unique within the question',
      ),
    };
  }
  const maxChoices = q.maxChoices ?? null;
  if (maxChoices !== null && q.kind !== 'multi') {
    return {
      failure: invalid(
        'INVALID_CHOICES',
        `Question ${num}: maxChoices only applies to multi questions`,
        'Drop maxChoices or change kind to multi',
      ),
    };
  }
  if (maxChoices !== null && maxChoices > normalized.length) {
    return {
      failure: invalid(
        'INVALID_CHOICES',
        `Question ${num}: maxChoices exceeds the number of options`,
        `Use at most ${normalized.length}`,
      ),
    };
  }
  return {
    question: {
      id: `q${num}`,
      prompt: q.prompt,
      kind: q.kind,
      required: q.required,
      options: normalized,
      maxChoices,
    },
  };
}

function buildQuestions(
  raw: readonly RawQuestion[],
): { questions: SurveyQuestion[] } | { failure: ReturnType<typeof error> } {
  const questions: SurveyQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i]!;
    const res = q.kind === 'text' ? buildTextQuestion(q, i + 1) : buildChoiceQuestion(q, i + 1);
    if ('failure' in res) return res;
    questions.push(res.question);
  }
  return { questions };
}

function checkSurveyTimes(opensAt: number | null, closesAt: number | null, now: number) {
  if (closesAt !== null && closesAt <= now) {
    return invalid('INVALID_TIME', 'closesAt is in the past', 'Pick a close time in the future');
  }
  if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
    return invalid(
      'INVALID_TIME',
      'opensAt is not before closesAt',
      'Open the survey before it closes',
    );
  }
  return null;
}

function checkSurveyAudience(caller: Caller, eligibleTier: Tier) {
  if (!tierAllows(caller.tier, eligibleTier)) {
    return invalid(
      'TIER_TOO_HIGH',
      `You can't create a survey for ${eligibleTier} and up`,
      'Pick an eligibleTier at or below your own',
    );
  }
  return null;
}

export const surveyCreate = command({
  name: 'survey-create',
  description:
    'Create a multi-question survey (single, multi, ranked, or free-text questions up to 500 chars) ' +
    'answered on the website. Opens immediately unless open is false or opensAt is in the future.',
  tier: 'leader',
  mutation: true,
  input: z.object({
    title: z.string().trim().min(1).max(SURVEY_LIMITS.title),
    description: z.string().trim().max(SURVEY_LIMITS.description).nullable().optional(),
    questions: z
      .array(rawQuestionSchema)
      .min(SURVEY_LIMITS.minQuestions)
      .max(SURVEY_LIMITS.maxQuestions),
    eligibleTier: eligibleTierSchema.default('raider'),
    anonymous: z.boolean().default(false),
    resultsVisible: z.enum(RESULTS_VISIBILITY).default('after-close'),
    opensAt: instantSchema.nullable().optional(),
    closesAt: instantSchema.nullable().optional(),
    tags: tagsSchema.default([]),
    open: z.boolean().default(true),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    if (!caller.memberId && caller.surface !== 'system') return notSignedIn();
    const at = now();
    const opensAt = input.opensAt ?? null;
    const closesAt = input.closesAt ?? null;
    const problem =
      checkSurveyAudience(caller, input.eligibleTier) ?? checkSurveyTimes(opensAt, closesAt, at);
    if (problem) return problem;

    const built = buildQuestions(input.questions);
    if ('failure' in built) return built.failure;

    const draft = await deps.polls.insertSurvey({
      guildId,
      title: input.title,
      description: input.description ?? null,
      questions: built.questions,
      eligibleTier: input.eligibleTier,
      anonymous: input.anonymous,
      resultsVisible: input.resultsVisible,
      status: 'draft',
      opensAt,
      closesAt,
      createdBy: actorOf(caller),
      closedBy: null,
      createdAt: at,
      closedAt: null,
      tags: [...new Set(input.tags)],
      configVersion: 1,
      results: null,
    });
    const startNow = input.open && (opensAt === null || opensAt <= at);
    const survey = startNow ? await openSurvey(deps, draft, at) : draft;
    return success(survey, {
      reasoning: startNow
        ? `Opened survey "${survey.title}" (${survey.questions.length} questions)`
        : `Saved survey "${survey.title}" as a draft`,
    });
  },
});

export const surveyOpen = command({
  name: 'survey-open',
  description: 'Open a draft survey for website responses now. Raid leaders and officers.',
  tier: 'leader',
  mutation: true,
  input: z.object({ surveyId: z.string().min(1) }),
  handler: async ({ surveyId }, { caller, guildId, deps, now }) => {
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    if (survey.status !== 'draft') {
      return invalid(
        'SURVEY_STATUS',
        `"${survey.title}" is ${survey.status}`,
        'This needs a draft survey',
      );
    }
    if (survey.closesAt !== null && survey.closesAt <= now()) {
      return invalid(
        'INVALID_TIME',
        'This survey would close before it opens',
        'Set a later closesAt',
      );
    }
    return success(await openSurvey(deps, { ...survey, opensAt: null }, now()));
  },
});

export const surveyClose = command({
  name: 'survey-close',
  description:
    'Close an open survey now and freeze its results. Destructive: previews the response count ' +
    'first; confirm to close.',
  tier: 'leader',
  destructive: true,
  input: z.object({ surveyId: z.string().min(1) }),
  handler: async ({ surveyId }, { caller, guildId, deps, dryRun, now }) => {
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    if (survey.status !== 'open') {
      return invalid(
        'SURVEY_STATUS',
        `"${survey.title}" is ${survey.status}`,
        'This needs an open survey',
      );
    }
    if (dryRun) {
      const count = await deps.polls.countSurveyResponses(guildId, surveyId);
      return success(
        { willClose: survey.title, responses: count },
        { reasoning: `Closes "${survey.title}" with ${count} responses` },
      );
    }
    const closed = await closeSurvey(deps, survey, now(), actorOf(caller));
    const visible = canSeeSurveyResults(caller, closed.survey);
    return success({
      survey: surveyViewOf(caller, closed.survey),
      results: visible ? closed.results : null,
    });
  },
});

export const surveyGet = command({
  name: 'survey-get',
  description:
    'Read one survey, the caller’s own response (if any), and response counts (results included ' +
    'when visible to the caller).',
  tier: 'member',
  input: z.object({ surveyId: z.string().min(1) }),
  handler: async ({ surveyId }, { caller, guildId, deps }) => {
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    const myResponse = caller.memberId
      ? await deps.polls.getSurveyResponseByMember(guildId, surveyId, caller.memberId)
      : null;
    const count = await deps.polls.countSurveyResponses(guildId, surveyId);
    let live: SurveyResults | undefined;
    if (survey.status !== 'closed' && canSeeSurveyResults(caller, survey)) {
      const [responses, names] = await Promise.all([
        deps.polls.listSurveyResponses(guildId, surveyId),
        survey.anonymous
          ? Promise.resolve(new Map<string, string>())
          : memberNameMap(deps, guildId),
      ]);
      live = tallySurvey(survey, responses, names);
    }
    return success({
      survey: surveyViewOf(caller, survey, live),
      myResponse,
      responses: count,
    });
  },
});

export const surveyList = command({
  name: 'survey-list',
  description: 'List surveys the caller may see, optionally filtered by status or tag.',
  tier: 'member',
  input: z.object({
    statuses: z.array(z.enum(POLL_STATUSES)).optional(),
    tag: z.string().trim().toLowerCase().min(1).max(POLL_LIMITS.tag).optional(),
  }),
  handler: async (filter, { caller, guildId, deps }) => {
    const list = (await deps.polls.listSurveys(guildId, filter)).filter((s) =>
      canSeeSurvey(caller, s),
    );
    return success(list.map((s) => surveyViewOf(caller, s)));
  },
});

export const surveyResults = command({
  name: 'survey-results',
  description:
    'Read tallied choice results and free-text answers for a survey. Respects resultsVisible and ' +
    'never reveals respondent names when the survey is anonymous.',
  tier: 'member',
  input: z.object({ surveyId: z.string().min(1) }),
  handler: async ({ surveyId }, { caller, guildId, deps }) => {
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    if (!canSeeSurveyResults(caller, survey)) {
      return invalid(
        'RESULTS_HIDDEN',
        'Results are hidden until this survey closes (or are officer-only)',
        'Check again after the survey closes, or ask an officer',
      );
    }
    const [responses, names] = await Promise.all([
      deps.polls.listSurveyResponses(guildId, surveyId),
      survey.anonymous ? Promise.resolve(new Map<string, string>()) : memberNameMap(deps, guildId),
    ]);
    const results =
      survey.status === 'closed' && survey.results
        ? survey.results
        : tallySurvey(survey, responses, names);
    return success({
      surveyId: survey.id,
      title: survey.title,
      anonymous: survey.anonymous,
      results,
    });
  },
});

export const surveyExport = command({
  name: 'survey-export',
  description:
    'Export a survey’s responses as RFC 4180 CSV. Anonymous surveys omit respondent identity ' +
    'columns. Raid leaders and officers.',
  tier: 'leader',
  input: z.object({ surveyId: z.string().min(1) }),
  handler: async ({ surveyId }, { caller, guildId, deps }) => {
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    if (!canSeeSurveyResults(caller, survey)) {
      return invalid(
        'RESULTS_HIDDEN',
        'Results for this survey are officer-only',
        'Ask an officer to export this survey',
      );
    }
    const [responses, names] = await Promise.all([
      deps.polls.listSurveyResponses(guildId, surveyId),
      survey.anonymous ? Promise.resolve(new Map<string, string>()) : memberNameMap(deps, guildId),
    ]);
    const csv = exportSurveyCsv(survey, responses, names);
    const slug = survey.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    return success(
      {
        surveyId: survey.id,
        filename: `${slug || 'survey'}.csv`,
        responses: responses.length,
        csv,
      },
      {
        reasoning: `Exported ${responses.length} response${responses.length === 1 ? '' : 's'} as CSV`,
      },
    );
  },
});

const rawAnswerSchema = z.object({
  questionId: z.string().min(1),
  choices: z.array(z.string().min(1)).max(POLL_LIMITS.maxOptions).optional(),
  text: z.string().max(SURVEY_LIMITS.textAnswer).nullable().optional(),
});

function validateChoiceAnswer(
  question: SurveyQuestion,
  choices: readonly string[],
): ReturnType<typeof error> | null {
  const validIds = new Set(question.options.map((o) => o.id));
  if (choices.some((c) => !validIds.has(c))) {
    return invalid(
      'INVALID_CHOICE',
      `Unknown option on "${question.prompt}"`,
      'Pick option ids returned by survey-get',
    );
  }
  if (new Set(choices).size !== choices.length) {
    return invalid(
      'INVALID_CHOICE',
      `Duplicate option on "${question.prompt}"`,
      'Pick each option at most once',
    );
  }
  if (question.kind === 'single' && choices.length > 1) {
    return invalid(
      'INVALID_CHOICE',
      `"${question.prompt}" allows only one choice`,
      'Pick a single option',
    );
  }
  if (
    question.kind === 'multi' &&
    question.maxChoices !== null &&
    choices.length > question.maxChoices
  ) {
    return invalid(
      'INVALID_CHOICE',
      `"${question.prompt}" allows at most ${question.maxChoices} choices`,
      `Pick at most ${question.maxChoices} options`,
    );
  }
  return null;
}

function validateOneAnswer(
  q: SurveyQuestion,
  raw: z.infer<typeof rawAnswerSchema> | undefined,
): { answer: SurveyAnswer } | { failure: ReturnType<typeof error> } {
  if (q.kind === 'text') {
    const text = raw?.text?.trim() ?? '';
    if (text.length > SURVEY_LIMITS.textAnswer) {
      return {
        failure: invalid(
          'TEXT_TOO_LONG',
          `Answer to "${q.prompt}" exceeds ${SURVEY_LIMITS.textAnswer} characters`,
          `Shorten your answer to at most ${SURVEY_LIMITS.textAnswer} characters`,
        ),
      };
    }
    if (q.required && !text) {
      return {
        failure: invalid(
          'ANSWER_REQUIRED',
          `"${q.prompt}" requires an answer`,
          'Provide a response for every required question',
        ),
      };
    }
    return { answer: { questionId: q.id, choices: [], text: text || null } };
  }

  const choices = raw?.choices ?? [];
  if (q.required && choices.length === 0) {
    return {
      failure: invalid(
        'ANSWER_REQUIRED',
        `"${q.prompt}" requires a choice`,
        'Pick an option for every required question',
      ),
    };
  }
  const err = validateChoiceAnswer(q, choices);
  if (err) return { failure: err };
  return { answer: { questionId: q.id, choices: [...choices], text: null } };
}

function validateSurveyAnswers(
  survey: Survey,
  rawAnswers: readonly z.infer<typeof rawAnswerSchema>[],
): { answers: SurveyAnswer[] } | { failure: ReturnType<typeof error> } {
  const byId = new Map<string, z.infer<typeof rawAnswerSchema>>();
  const questionIds = new Set(survey.questions.map((q) => q.id));
  for (const a of rawAnswers) {
    if (!questionIds.has(a.questionId)) {
      return {
        failure: invalid(
          'UNKNOWN_QUESTION',
          `Unknown question "${a.questionId}"`,
          'Answer only question ids listed in survey-get',
        ),
      };
    }
    if (byId.has(a.questionId)) {
      return {
        failure: invalid(
          'DUPLICATE_ANSWER',
          `Question "${a.questionId}" was answered more than once`,
          'Send one answer entry per questionId',
        ),
      };
    }
    byId.set(a.questionId, a);
  }

  const normalized: SurveyAnswer[] = [];
  for (const q of survey.questions) {
    const res = validateOneAnswer(q, byId.get(q.id));
    if ('failure' in res) return res;
    normalized.push(res.answer);
  }
  return { answers: normalized };
}

export const responseSet = command({
  name: 'response-set',
  description:
    'Submit or update the caller’s response to an open survey (one response per member; free ' +
    'text up to 500 chars).',
  tier: 'member',
  mutation: true,
  input: z.object({
    surveyId: z.string().min(1),
    answers: z.array(rawAnswerSchema).max(SURVEY_LIMITS.maxQuestions),
  }),
  handler: async ({ surveyId, answers }, { caller, guildId, deps, now }) => {
    if (!caller.memberId) return notSignedIn();
    const survey = await deps.polls.getSurvey(guildId, surveyId);
    if (!survey || !canSeeSurvey(caller, survey)) return surveyNotFound();
    if (survey.status !== 'open') {
      return invalid(
        'SURVEY_STATUS',
        `"${survey.title}" is ${survey.status}`,
        'Only open surveys accept responses',
      );
    }
    const validated = validateSurveyAnswers(survey, answers);
    if ('failure' in validated) return validated.failure;

    const at = now();
    const saved = await deps.polls.upsertSurveyResponse({
      guildId,
      surveyId,
      memberId: caller.memberId,
      answers: validated.answers,
      submittedAt: at,
      updatedAt: at,
    });
    await deps.pollEvents.emit(guildId, 'response-set', {
      surveyId,
      memberId: survey.anonymous ? null : caller.memberId,
    });
    return success(saved, { reasoning: `Saved your response to "${survey.title}"` });
  },
});
