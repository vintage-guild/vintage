import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { ITEM_QUALITIES, LAUNCH_RAIDS, RAID_IDS, RAIDS_OPEN_AT } from '../contract';
import { firstKills } from '../domain/ledger';
import { command } from '../store';

/** Epoch ms, or an ISO 8601 date-time with an offset (`2026-12-10T22:40:00-05:00`). */
const instantSchema = z
  .union([z.number().int().positive(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === 'number' ? value : Date.parse(value)));

const lootSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      quality: z.enum(ITEM_QUALITIES),
    }),
  )
  .max(12)
  .default([]);

const bossNotFound = (raidName: string) =>
  error('BOSS_NOT_FOUND', `No such boss in ${raidName}`, {
    suggestion: 'Use the boss ids from progress-get',
    retryable: false,
  });

const invalidTime = (message: string, suggestion: string) =>
  error('INVALID_TIME', message, { suggestion, retryable: false });

export const killRecord = command({
  name: 'kill-record',
  description:
    'Record a boss kill: the raid, the boss (ids from progress-get), when (defaults to now), ' +
    'and what dropped with its quality. The guild’s first kill of a boss is what the ledger ' +
    'shows; later kills are kept as the kill log. The same kill again (same raid, boss and ' +
    'time) changes nothing and answers duplicate: true.',
  tier: 'leader',
  mutation: true,
  input: z.object({
    raidId: z.enum(RAID_IDS),
    bossId: z.string().min(1),
    killedAt: instantSchema.optional(),
    loot: lootSchema,
    note: z.string().trim().min(1).max(200).nullable().default(null),
  }),
  handler: async ({ raidId, bossId, killedAt, loot, note }, { caller, guildId, deps, now }) => {
    const raid = LAUNCH_RAIDS.find((r) => r.id === raidId);
    const boss = raid?.bosses.find((b) => b.id === bossId);
    if (!raid || !boss) return bossNotFound(raid?.name ?? raidId);
    const at = now();
    const when = killedAt ?? at;
    if (when > at) {
      return invalidTime('That kill is in the future', 'Record kills after they happen');
    }
    if (when < RAIDS_OPEN_AT) {
      return invalidTime(
        'Raids open December 9, 2026',
        'Check the kill time; nothing can die before the raids unlock',
      );
    }
    const kills = await deps.progress.listKills(guildId, { raidId });
    const previous = firstKills(kills).get(`${raidId}/${bossId}`);
    // A re-recorded export (or a retry) carries the same kill; keep the log to one entry for it.
    const same = kills.find((k) => k.bossId === bossId && k.killedAt === when);
    if (same) {
      return success(
        { kill: same, first: previous?.id === same.id, duplicate: true },
        { reasoning: `${boss.name} at that time is already recorded; nothing changed` },
      );
    }
    const kill = await deps.progress.insertKill({
      guildId,
      raidId,
      bossId,
      killedAt: when,
      loot,
      note,
      recordedBy: caller.memberId ?? caller.surface,
      recordedAt: at,
    });
    const first = !previous || when < previous.killedAt;
    return success(
      { kill, first, duplicate: false },
      {
        reasoning: first
          ? `First kill of ${boss.name} in ${raid.name}`
          : `${boss.name} again; the first kill stays the ledger entry`,
      },
    );
  },
});
