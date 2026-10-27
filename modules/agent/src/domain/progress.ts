// A running ask's progress, as a surface reads it: the agent's notes so far and the answer while
// it is being written (#167). The turn loop reports it from the Agents API event stream; this
// writes it to the run.
import type { AgentStore } from '../store';

/** Bounds on what a run keeps while it runs. The answer itself is not bounded here. */
export const PROGRESS_LIMITS = { notes: 12, noteChars: 500, draftChars: 4000 };

export interface RunProgress {
  notes: string[];
  draft: string | null;
}

/**
 * Write progress to a running run. A run that already ended is left alone, so a late write never
 * undoes its answer. Returns whether it wrote.
 */
export async function recordProgress(
  store: AgentStore,
  guildId: string,
  runId: string,
  progress: RunProgress,
): Promise<boolean> {
  const run = await store.getRun(guildId, runId);
  if (run?.status !== 'running') return false;
  const { notes, noteChars, draftChars } = PROGRESS_LIMITS;
  await store.updateRun(guildId, runId, {
    notes: progress.notes.slice(-notes).map((n) => n.slice(0, noteChars)),
    draft: progress.draft ? progress.draft.slice(0, draftChars) : null,
  });
  return true;
}
