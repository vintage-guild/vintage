import { applicationGet, applicationSubmit, applicationWithdraw } from './apply';
import {
  applicationConfigGet,
  applicationConfigSet,
  applicationDecline,
  applicationList,
  applicationReview,
} from './review';

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
  applyModal,
  labelsLine,
  type NeedLineView,
  type ParsedApplicationId,
  parseApplicationCustomId,
  REPLY_FIELD,
  renderApplicantDm,
  renderApplicationPost,
  renderDeclinePreview,
  renderRecruitingPost,
  replyModal,
} from '../render/discord';
export type {
  ApplicationEffects,
  ApplicationFilter,
  ApplicationsDeps,
  ApplicationsStore,
} from '../store';
export { SUBMIT_LIMIT } from './apply';

/** Every applications command, registered by apps/api through guild-kit. */
export const applicationsCommands = [
  applicationSubmit,
  applicationGet,
  applicationWithdraw,
  applicationList,
  applicationReview,
  applicationDecline,
  applicationConfigGet,
  applicationConfigSet,
] as const;
