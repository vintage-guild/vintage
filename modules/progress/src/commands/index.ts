import { killRecord } from './kill';
import { progressGet } from './read';

export type { ProgressDeps, ProgressStore } from '../store';

/** Every progress command, registered by apps/api through guild-kit. */
export const progressCommands = [killRecord, progressGet] as const;
