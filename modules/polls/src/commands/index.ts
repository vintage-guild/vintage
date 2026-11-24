import { pollCancel, pollClose, pollCreate, pollOpen, pollSweep, pollUpdate } from './poll';
import { pollGet, pollList, pollResults } from './read';
import {
  responseSet,
  surveyClose,
  surveyCreate,
  surveyExport,
  surveyGet,
  surveyList,
  surveyOpen,
  surveyResults,
} from './survey';
import { voteCast, voteRetract } from './vote';

export { exportSurveyCsv, surveyNonResponders, tallySurvey } from '../domain/survey';
export {
  buildSurveyCard,
  renderSurveyInvite,
  renderSurveyReminderDm,
  type SurveyCard,
  surveyRenderKey,
} from '../render/survey';
export type {
  PollsChannels,
  PollsDeps,
  PollsEventSink,
  PollsMembers,
  PollsStore,
} from '../store';
export type { PollView } from './shared';
export type { SurveyView } from './survey';

/** Every polls & surveys command, registered by apps/api through guild-kit (#61, #65). */
export const pollsCommands = [
  pollCreate,
  pollUpdate,
  pollOpen,
  pollClose,
  pollCancel,
  pollSweep,
  pollGet,
  pollList,
  pollResults,
  voteCast,
  voteRetract,
  surveyCreate,
  surveyOpen,
  surveyClose,
  surveyGet,
  surveyList,
  surveyResults,
  surveyExport,
  responseSet,
] as const;

export {
  buildPollCard,
  MAX_VOTE_BUTTONS,
  type PollAction,
  type PollCard,
  parsePollCustomId,
  pollCustomId,
  publicTally,
  renderKey,
  renderPollPost,
} from '../render/discord';
