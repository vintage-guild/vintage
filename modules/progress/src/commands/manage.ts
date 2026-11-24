import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { type KillLogEntry, LAUNCH_RAIDS, RAID_IDS } from '../contract';
import { firstKills } from '../domain/ledger';
import { command } from '../store';

function namesFor(raidId: string, bossId: string): { raidName: string; bossName: string } {
  const raid = LAUNCH_RAIDS.find((r) => r.id === raidId);
  const boss = raid?.bosses.find((b) => b.id === bossId);
  return { raidName: raid?.name ?? raidId, bossName: boss?.name ?? bossId };
}

function formatUtcDay(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export const killList = command({
  name: 'kill-list',
  description:
    'Every recorded kill for the guild (or one raid / boss), newest first, with who recorded ' +
    'it, what dropped, notes, and whether each entry is currently the ledger’s first kill.',
  tier: 'leader',
  input: z.object({
    raidId: z.enum(RAID_IDS).optional(),
    bossId: z.string().min(1).optional(),
  }),
  handler: async ({ raidId, bossId }, { guildId, deps }) => {
    const all = await deps.progress.listKills(guildId, raidId ? { raidId } : {});
    const firsts = firstKills(all);
    const filtered = bossId ? all.filter((k) => k.bossId === bossId) : all;
    const kills: KillLogEntry[] = [...filtered]
      .sort((a, b) => b.killedAt - a.killedAt || b.recordedAt - a.recordedAt)
      .map((kill) => {
        const { raidName, bossName } = namesFor(kill.raidId, kill.bossId);
        const first = firsts.get(`${kill.raidId}/${kill.bossId}`)?.id === kill.id;
        return { ...kill, raidName, bossName, first };
      });
    return success(
      { kills },
      {
        reasoning: kills.length
          ? `${kills.length} kill${kills.length === 1 ? '' : 's'} recorded`
          : 'No kills recorded',
      },
    );
  },
});

export const killRemove = command({
  name: 'kill-remove',
  description:
    'Remove a recorded boss kill. Officer-only and destructive: previews the boss, raid, time, ' +
    'and whether the ledger’s first kill moves to the next-earliest kill; confirm to delete.',
  tier: 'officer',
  destructive: true,
  input: z.object({ killId: z.string().min(1) }),
  handler: async ({ killId }, { guildId, deps, dryRun }) => {
    const kill = await deps.progress.getKill(guildId, killId);
    if (!kill) {
      return error('KILL_NOT_FOUND', 'No recorded kill with that id', {
        suggestion: 'Check kill-list for the kill id',
        retryable: false,
      });
    }
    const raidKills = await deps.progress.listKills(guildId, { raidId: kill.raidId });
    const first = firstKills(raidKills).get(`${kill.raidId}/${kill.bossId}`);
    const wasFirstKill = first?.id === kill.id;
    const remaining = raidKills.filter((k) => k.bossId === kill.bossId && k.id !== kill.id);
    const replacement = wasFirstKill ? (remaining[0] ?? null) : null;
    const nextFirstKillAt = replacement?.killedAt ?? null;
    const { raidName, bossName } = namesFor(kill.raidId, kill.bossId);
    const when = formatUtcDay(kill.killedAt);

    let ledgerEffect: string;
    if (!wasFirstKill) {
      ledgerEffect = 'the first kill stays on the ledger';
    } else if (nextFirstKillAt !== null) {
      ledgerEffect = `the ledger’s first kill moves to ${formatUtcDay(nextFirstKillAt)}`;
    } else {
      ledgerEffect = `${bossName} returns to unkilled on the ledger`;
    }

    if (dryRun) {
      return success(
        {
          willRemove: {
            id: kill.id,
            raidId: kill.raidId,
            raidName,
            bossId: kill.bossId,
            bossName,
            killedAt: kill.killedAt,
            loot: kill.loot,
            note: kill.note,
            recordedBy: kill.recordedBy,
          },
          wasFirstKill,
          nextFirstKillAt,
        },
        { reasoning: `Removes ${bossName} (${raidName}, ${when}); ${ledgerEffect}` },
      );
    }

    await deps.progress.deleteKill(guildId, kill.id);
    return success(
      { removed: kill, wasFirstKill, nextFirstKillAt },
      { reasoning: `Removed ${bossName} (${raidName}, ${when}); ${ledgerEffect}` },
    );
  },
});
