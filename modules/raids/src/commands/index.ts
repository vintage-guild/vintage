import { compSuggest } from './comp';
import { raidCancel, raidComplete, raidCreate, raidGet, raidList, raidReschedule } from './raid';
import { rosterBench, rosterLock, rosterMove, rosterRemove, rosterUnlock } from './roster';
import { scheduleCreate, scheduleList, scheduleMaterialize, scheduleUpdate } from './schedule';
import { signupGet, signupList, signupSet } from './signup';

export { occurrences } from '../domain/recurrence';
export type { RaidsDeps, RaidsEventSink, RaidsMembers, RaidsStore } from '../store';

/** Every raids command, registered by apps/api through guild-kit. */
export const raidsCommands = [
  scheduleCreate,
  scheduleUpdate,
  scheduleList,
  scheduleMaterialize,
  raidCreate,
  raidReschedule,
  raidCancel,
  raidComplete,
  raidGet,
  raidList,
  signupSet,
  signupGet,
  signupList,
  rosterLock,
  rosterUnlock,
  rosterBench,
  rosterMove,
  rosterRemove,
  compSuggest,
] as const;
