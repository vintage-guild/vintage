import { applicationCheck, applicationGet, applicationSubmit, applicationWithdraw } from './apply';
import { applicationOnboard } from './onboard';
import {
  applicationConfigGet,
  applicationConfigSet,
  applicationDecline,
  applicationList,
  applicationReview,
} from './review';

export { BLOCKS, checkApply, guildLimit } from '../domain/eligibility';
export {
  LABEL_THRESHOLDS,
  labelApplication,
  labelRequest,
  type NeedLine,
  readLabels,
} from '../domain/labels';
export {
  APPLY_FIELDS,
  type ApplicationAction,
  type ApplyForm,
  applicationCustomId,
  applyFormCustomId,
  applyFullModal,
  applyModal,
  applyStartCustomId,
  labelsLine,
  type NeedLineView,
  type ParsedApplicationId,
  parseApplicationCustomId,
  parseClassSpec,
  REPLY_FIELD,
  type ReviewAction,
  renderAcceptReply,
  renderApplicantDm,
  renderApplicationPost,
  renderDeclinePreview,
  renderOnboardingDm,
  renderRecruitingPost,
  replyModal,
  START_FIELDS,
} from '../render/discord';
export type {
  ApplicationEffects,
  ApplicationFilter,
  ApplicationRoles,
  ApplicationsDeps,
  ApplicationsStore,
} from '../store';
export { SUBMIT_LIMIT } from './apply';

/** Every applications command, registered by apps/api through guild-kit. */
export const applicationsCommands = [
  applicationCheck,
  applicationSubmit,
  applicationGet,
  applicationWithdraw,
  applicationList,
  applicationReview,
  applicationDecline,
  applicationOnboard,
  applicationConfigGet,
  applicationConfigSet,
] as const;
