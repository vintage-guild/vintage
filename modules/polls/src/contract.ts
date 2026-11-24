// Public surface of the polls module. Other modules import only this file.
//
// Polls know nothing about raids, loot, or any other feature. A feature that wants a poll
// creates one through polls' commands, tags it, and reacts to `poll-closed` for that tag
// (docs/features/active/polls/polls.plan.md, "Integrations").

import type { Tier } from '@vintage/guild-kit';

export const POLL_METHODS = ['single', 'multi', 'ranked'] as const;
/** `single`: one choice. `multi`: approval, up to `maxChoices`. `ranked`: instant-runoff. */
export type PollMethod = (typeof POLL_METHODS)[number];

export const POLL_STATUSES = ['draft', 'open', 'closed', 'cancelled'] as const;
/** `draft` takes no votes; `open` does; `closed` has a final result; `cancelled` has none. */
export type PollStatus = (typeof POLL_STATUSES)[number];

export const RESULTS_VISIBILITY = ['live', 'after-close', 'officers'] as const;
/** Who sees the tally while the poll is open. Everyone eligible sees it once it closes, except `officers`. */
export type ResultsVisibility = (typeof RESULTS_VISIBILITY)[number];

/** Sized to fit a Discord embed and string select (PLAN §6.2; discord-kit COMPONENT_LIMITS). */
export const POLL_LIMITS = {
  question: 300,
  description: 1000,
  optionLabel: 80,
  minOptions: 2,
  maxOptions: 25,
  tags: 10,
  tag: 40,
} as const;

/** The lowest tier a poll may let vote. Public callers (friends, unranked) never vote. */
export const MIN_ELIGIBLE_TIER: Tier = 'member';

export interface PollOption {
  /** Stable within the poll; votes reference it. Short, so it fits a Discord custom_id. */
  id: string;
  label: string;
  emoji: string | null;
  /**
   * Opaque data for the feature that created the poll (e.g. the coordinator stores a start
   * time here). Polls never reads it.
   */
  value: string | null;
}

export interface Poll {
  id: string;
  guildId: string;
  question: string;
  description: string | null;
  options: PollOption[];
  method: PollMethod;
  /** `multi` only: the most options one ballot may pick. Null means any number. */
  maxChoices: number | null;
  /** Who may vote. Never below `MIN_ELIGIBLE_TIER`. */
  eligibleTier: Tier;
  /** No command, render, or event names a voter, on any surface, officers included. */
  anonymous: boolean;
  resultsVisible: ResultsVisibility;
  /** Minimum ballots for the result to count. Null means no minimum. */
  quorum: number | null;
  status: PollStatus;
  /** Epoch ms. A due draft opens on the next sweep; null means opened by hand. */
  opensAt: number | null;
  /** Epoch ms. A due open poll closes on the next sweep; null means closed by hand. */
  closesAt: number | null;
  createdBy: string;
  /** Member who closed or cancelled it; null when the sweep closed it or it is still live. */
  closedBy: string | null;
  createdAt: number;
  closedAt: number | null;
  /** Lowercase labels other features filter on (`raid-night`, `loot-council`). */
  tags: string[];
  /** Bumped on every change to the poll itself, so Discord posts re-render only when needed. */
  configVersion: number;
  /** Set when the poll closes; null while it is live or when cancelled. */
  results: PollResults | null;
}

/** One member's ballot. One per member per poll; changing it replaces it. */
export interface Vote {
  id: string;
  guildId: string;
  pollId: string;
  memberId: string;
  /** Option ids. Preference order for `ranked`; ignored order otherwise. */
  choices: string[];
  /** Always 1 today; reserved for weighting later. */
  weight: number;
  castAt: number;
  updatedAt: number;
}

export interface OptionTally {
  optionId: string;
  /** Votes for the option; first preferences for `ranked`. */
  votes: number;
}

/** One instant-runoff round: the count among options still standing, and who went out. */
export interface RankedRound {
  counts: OptionTally[];
  eliminated: string[];
}

export interface PollResults {
  method: PollMethod;
  /** Ballots with at least one valid choice. */
  ballots: number;
  quorumMet: boolean;
  /** In the poll's option order. */
  options: OptionTally[];
  /** Winning option ids. Several on a tie; empty when nobody voted. */
  winners: string[];
  /** `ranked` only. */
  rounds: RankedRound[] | null;
}

/** Where a poll is shown in Discord, so the poster can edit it. */
export interface PollPost {
  id: string;
  guildId: string;
  pollId: string;
  channelId: string;
  messageId: string;
  /** What was last rendered (config version and ballot count); skip edits when unchanged. */
  renderedKey: string;
}

export const SURVEY_QUESTION_KINDS = ['single', 'multi', 'ranked', 'text'] as const;
/** Choice questions reuse poll methods (`single`, `multi`, `ranked`); `text` takes free text up to 500 chars. */
export type SurveyQuestionKind = (typeof SURVEY_QUESTION_KINDS)[number];

export const SURVEY_LIMITS = {
  title: 200,
  description: 1000,
  minQuestions: 1,
  maxQuestions: 20,
  prompt: 300,
  textAnswer: 500,
} as const;

export interface SurveyQuestion {
  /** Stable within the survey (`q1`, `q2`, ...). */
  id: string;
  prompt: string;
  kind: SurveyQuestionKind;
  required: boolean;
  /** Non-empty (2–25) for choice kinds; empty for `text`. */
  options: PollOption[];
  /** `multi` only. */
  maxChoices: number | null;
}

export interface SurveyTextAnswerView {
  text: string;
  /** Always null when `survey.anonymous` is true. */
  memberId: string | null;
  displayName: string | null;
}

export type SurveyQuestionResults =
  | {
      questionId: string;
      prompt: string;
      kind: PollMethod;
      tally: PollResults;
    }
  | {
      questionId: string;
      prompt: string;
      kind: 'text';
      responses: number;
      answers: SurveyTextAnswerView[];
    };

export interface SurveyResults {
  /** Total members who submitted a response. */
  responses: number;
  questions: SurveyQuestionResults[];
}

/** A multi-question survey answered on the website, with Discord invites and non-responder nudges (#65). */
export interface Survey {
  id: string;
  guildId: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  eligibleTier: Tier;
  /** No command, render, export, or event names respondents, officers included. */
  anonymous: boolean;
  resultsVisible: ResultsVisibility;
  status: PollStatus;
  opensAt: number | null;
  closesAt: number | null;
  createdBy: string;
  closedBy: string | null;
  createdAt: number;
  closedAt: number | null;
  tags: string[];
  configVersion: number;
  /** Frozen on close; null while draft/open or cancelled. */
  results: SurveyResults | null;
}

export interface SurveyAnswer {
  questionId: string;
  /** Option ids for choice questions; empty for `text`. */
  choices: string[];
  /** Trimmed text ≤ 500 chars for `text` questions; null for choice questions. */
  text: string | null;
}

/** One member's response to a survey. One per member per survey; updating replaces it. */
export interface SurveyResponse {
  id: string;
  guildId: string;
  surveyId: string;
  memberId: string;
  answers: SurveyAnswer[];
  submittedAt: number;
  updatedAt: number;
}

/** Where a survey invite embed is posted in Discord, so its responded count refreshes in place. */
export interface SurveyPost {
  id: string;
  guildId: string;
  surveyId: string;
  channelId: string;
  messageId: string;
  renderedKey: string;
}

/** Command names polls exposes. */
export const POLLS_COMMANDS = [
  'poll-create',
  'poll-update',
  'poll-open',
  'poll-close',
  'poll-cancel',
  'poll-get',
  'poll-list',
  'poll-results',
  'poll-sweep',
  'vote-cast',
  'vote-retract',
  'survey-create',
  'survey-open',
  'survey-close',
  'survey-get',
  'survey-list',
  'survey-results',
  'survey-export',
  'response-set',
] as const;
export type PollsCommandName = (typeof POLLS_COMMANDS)[number];

/** Events polls emits on the core event bus (PLAN §4.3). */
export interface PollsEvents {
  /** A poll started taking votes. The Discord poster posts it. */
  'poll-opened': {
    pollId: string;
    question: string;
    closesAt: number | null;
    eligibleTier: Tier;
    tags: string[];
  };
  /** A ballot was cast, changed, or retracted (`to: null`). `memberId` is null for anonymous polls. */
  'vote-cast': {
    pollId: string;
    memberId: string | null;
    from: string[] | null;
    to: string[] | null;
  };
  /** A poll closed with a result. Features react by tag (`raid-night` → the coordinator). */
  'poll-closed': {
    pollId: string;
    tags: string[];
    results: PollResults;
  };
  /** A survey started taking website responses; Discord posts an invite embed. */
  'survey-opened': {
    surveyId: string;
    title: string;
    closesAt: number | null;
    eligibleTier: Tier;
    tags: string[];
  };
  /** A member submitted or updated a survey response. `memberId` is null when anonymous. */
  'response-set': {
    surveyId: string;
    memberId: string | null;
  };
  /** A survey closed with its frozen results. */
  'survey-closed': {
    surveyId: string;
    tags: string[];
    results: SurveyResults;
  };
}
