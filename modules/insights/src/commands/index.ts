import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { clean, findingsFor, shortName } from '../domain/findings';
import { pickFindings, plainDm } from '../domain/gate';
import type { RunUploadV1 } from '../farsight/run-summary';
import { runUploadSchema } from '../farsight/run-summary';
import { command } from '../store';

export { clean, type Finding, type FindingKind, findingsFor, shortName } from '../domain/findings';
export {
  DM_INSTRUCTIONS,
  DROP_THRESHOLD,
  gateFindings,
  gateRequest,
  MAX_PER_RAIDER,
  pickFindings,
  plainDm,
} from '../domain/gate';
export { RUN_SUMMARY_VERSION, type RunUploadV1, runUploadSchema } from '../farsight/run-summary';
export type { CharacterOwners, InsightsDeps, InsightsEffects, InsightsStore } from '../store';

/** What run-import answers: findings and links only for a new import. */
export interface ImportResult {
  runId: string;
  imported: boolean;
  findings: number | null;
  raiders?: number;
  linked?: number;
}

/** Upload limits: a raid's summary fits well inside them; anything bigger is not a real run. */
export const UPLOAD_LIMITS = {
  roster: 40,
  deaths: 2000,
  kicks: 200,
  /** pulls, interrupts, abilities, mobs, encounters: findings don't read them. */
  other: 2000,
  runKey: 200,
  text: 128,
} as const;

/** The first limit an upload breaks, or null. */
export function uploadTooLarge(run: RunUploadV1['run']): string | null {
  const L = UPLOAD_LIMITS;
  if (run.roster.length > L.roster) return `more than ${L.roster} players`;
  if (run.deaths.length > L.deaths) return `more than ${L.deaths} deaths`;
  if (run.kicks.length > L.kicks) return `more than ${L.kicks} kick rows`;
  for (const key of ['pulls', 'interrupts', 'abilities', 'mobs', 'encounters'] as const) {
    if (run[key].length > L.other) return `more than ${L.other} ${key}`;
  }
  if (run.run_key.length > L.runKey) return 'a run_key over 200 characters';
  const texts = [
    run.zone_name,
    ...run.roster.map((r) => r.name),
    ...run.kicks.map((k) => k.player),
    ...run.deaths.flatMap((d) => [
      d.player,
      d.killing_blow?.spell ?? '',
      d.killing_blow?.source ?? '',
    ]),
  ];
  if (texts.some((t) => t.length > L.text)) return `a name over ${L.text} characters`;
  return null;
}

const notFound = (id: string) =>
  error('RUN_NOT_FOUND', `No imported run ${id}`, {
    suggestion: 'List runs with insights-runs',
    retryable: false,
  });

export const runImport = command({
  name: 'run-import',
  description:
    'Import one Farsight Crawler run summary (the `farsight.run` v1 upload, never the raw log). Vintage keeps the run, finds what each raider could do better with the evidence, and links characters to members by name. Importing the same run again does nothing.',
  tier: 'raider',
  mutation: true,
  input: z.object({ upload: runUploadSchema }),
  handler: async ({ upload }, { caller, guildId, deps, now }) => {
    const run = upload.run;
    const tooLarge = uploadTooLarge(run);
    if (tooLarge) {
      return error('UPLOAD_TOO_LARGE', `This upload has ${tooLarge}`, {
        suggestion: 'Upload one run summary from Farsight Crawler, not a merged or edited file',
        retryable: false,
      });
    }
    const roster = [...new Set(run.roster.map((r) => shortName(r.name)))];
    const owners = await deps.characterOwners.ownersOf(guildId, roster);
    // A raider imports a run they were in; officers may import any.
    const inRun = [...owners.values()].includes(caller.memberId ?? '');
    if (!inRun && !tierAllows(caller.tier, 'officer')) {
      return error('NOT_IN_RUN', 'None of your characters is on this run’s roster', {
        suggestion: 'Import a run you were in, or ask an officer to import it',
        retryable: false,
      });
    }
    const existing = await deps.insights.getRunByKey(guildId, run.run_key);
    if (existing) {
      return success<ImportResult>(
        { runId: existing.id, findings: null, imported: false },
        { reasoning: 'Already imported' },
      );
    }
    const saved = await deps.insights.insertRun({
      guildId,
      runKey: run.run_key,
      zoneName: clean(run.zone_name),
      startedAt: Math.round(run.start_ts * 1000),
      durationSeconds: Math.round(run.duration),
      roster,
      importedBy: caller.memberId ?? caller.surface,
      createdAt: now(),
      sentAt: null,
    });
    const findings = findingsFor(run).map((f) => ({
      ...f,
      guildId,
      runId: saved.id,
      memberId: owners.get(f.character) ?? null,
    }));
    await deps.insights.insertFindings(findings);
    return success<ImportResult>({
      runId: saved.id,
      imported: true,
      findings: findings.length,
      raiders: roster.length,
      linked: roster.filter((name) => owners.has(name)).length,
    });
  },
});

export const insightsRuns = command({
  name: 'insights-runs',
  description: 'Imported runs, newest first: zone, when, how long, who was there.',
  tier: 'member',
  input: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  handler: async ({ limit }, { guildId, deps }) =>
    success(await deps.insights.listRuns(guildId, limit)),
});

export const insightsGet = command({
  name: 'insights-get',
  description:
    'One run’s findings (the latest without an id). Officers see every raider’s; members see only their own.',
  tier: 'member',
  input: z.object({ runId: z.string().min(1).optional() }),
  handler: async ({ runId }, { caller, guildId, deps }) => {
    const run = runId
      ? await deps.insights.getRun(guildId, runId)
      : ((await deps.insights.listRuns(guildId, 1))[0] ?? null);
    if (!run) return runId ? notFound(runId) : success(null);
    const all = await deps.insights.listFindings(guildId, run.id);
    const officer = tierAllows(caller.tier, 'officer');
    const findings = officer
      ? all
      : all.filter((f) => f.memberId && f.memberId === caller.memberId);
    return success({ run, findings });
  },
});

export const insightsOptInSet = command({
  name: 'insights-optin-set',
  description:
    'Whether you get a private Discord note after a raid with what the log says you could do better. Off until you turn it on.',
  tier: 'member',
  mutation: true,
  input: z.object({ dms: z.boolean() }),
  handler: async ({ dms }, { caller, guildId, deps, now }) => {
    if (!caller.memberId) {
      return error('NOT_A_MEMBER', 'Only guild members get raid notes', {
        suggestion: 'Sign in with Discord as a guild member',
        retryable: false,
      });
    }
    return success(
      await deps.insights.setOptIn({ guildId, memberId: caller.memberId, dms, updatedAt: now() }),
    );
  },
});

export const insightsSend = command({
  name: 'insights-send',
  description:
    'Send a run’s notes to the raiders who opted in: one private DM each, at most two findings, worded by the agent when it is on. Shows who would get one first; confirm to send. Each run sends once.',
  tier: 'officer',
  destructive: true,
  input: z.object({ runId: z.string().min(1) }),
  handler: async ({ runId }, { guildId, deps, dryRun, now }) => {
    const run = await deps.insights.getRun(guildId, runId);
    if (!run) return notFound(runId);
    if (run.sentAt) {
      return error('ALREADY_SENT', 'This run’s notes were already sent', {
        suggestion: 'Each run sends once',
        retryable: false,
      });
    }
    const optedIn = new Set(await deps.insights.listOptedIn(guildId));
    const findings = await deps.insights.listFindings(guildId, runId);
    const recipients = [
      ...new Set(
        findings.filter((f) => f.memberId && optedIn.has(f.memberId)).map((f) => f.character),
      ),
    ];
    if (dryRun) {
      return success({
        run: { id: run.id, zoneName: run.zoneName },
        wouldMessage: recipients,
        /** Each DM's facts before the gate and the wording; the gate may drop one more. */
        messages: recipients.map((character) => ({
          character,
          text: plainDm(
            run.zoneName,
            pickFindings(
              findings.filter((f) => f.character === character),
              null,
            ),
          ),
        })),
        note: 'Members who turned off bot DMs are skipped when sending.',
        withFindingsButNotOptedIn: [
          ...new Set(
            findings.filter((f) => !f.memberId || !optedIn.has(f.memberId)).map((f) => f.character),
          ),
        ].length,
      });
    }
    const saved = await deps.insights.markSent(guildId, runId, now());
    await deps.insightsEffects.send(guildId, runId);
    return success({ run: saved, recipients: recipients.length });
  },
});

/** Every insights command, registered by apps/api through guild-kit. */
export const insightsCommands = [
  runImport,
  insightsRuns,
  insightsGet,
  insightsOptInSet,
  insightsSend,
] as const;
