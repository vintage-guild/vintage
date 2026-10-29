import { compSuggest } from './comp';
import { attendanceList, raidExportCheck, raidExportRecord } from './export';
import { raidCancel, raidComplete, raidCreate, raidGet, raidList, raidReschedule } from './raid';
import { rosterBench, rosterLock, rosterMove, rosterRemove, rosterUnlock } from './roster';
import { scheduleCreate, scheduleList, scheduleMaterialize, scheduleUpdate } from './schedule';
import { signupGet, signupList, signupSet, signupSuggest } from './signup';

export {
  isValidTimeZone,
  occurrences,
  type WallClock,
  wallClock,
  zonedTime,
} from '../domain/recurrence';
export type { RaidsDeps, RaidsEventSink, RaidsLoot, RaidsMembers, RaidsStore } from '../store';

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
  signupSuggest,
  signupGet,
  signupList,
  rosterLock,
  rosterUnlock,
  rosterBench,
  rosterMove,
  rosterRemove,
  compSuggest,
  raidExportCheck,
  raidExportRecord,
  attendanceList,
] as const;
