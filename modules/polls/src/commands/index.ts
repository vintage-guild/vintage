import { pollCancel, pollClose, pollCreate, pollOpen, pollSweep, pollUpdate } from './poll';
import { pollGet, pollList, pollResults } from './read';
import { voteCast, voteRetract } from './vote';

export type { PollsDeps, PollsStore } from '../store';
export type { PollView } from './shared';

/** Every polls command, registered by apps/api through guild-kit (#61). */
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
] as const;
