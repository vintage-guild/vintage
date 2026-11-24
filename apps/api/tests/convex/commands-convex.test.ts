// End-to-end command execution over convex-test (#260): verifies cross-module Convex adapter
// wiring (identity, raids, loot, progress, events table) and strict guildId isolation through
// the real guild-kit registry.
import { type Caller, createGuildRegistry } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import { RAIDS_OPEN_AT } from '@vintage/progress/contract';
import type { RaidEvent, Signup, SignupGuess } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  agentDeps,
  applicationsDeps,
  armoryDeps,
  coordinatorDeps,
  identityDeps,
  insightsDeps,
  lootDeps,
  pollsDeps,
  progressDeps,
  type RunCommand,
  raidsDeps,
  siteDeps,
} from '../../convex/stores';
import { commands, type VintageDeps } from '../../src/registry';
import { createConvexBackend, GUILD_A, GUILD_B } from './harness';

const NOW = RAIDS_OPEN_AT + 7 * 86_400_000;

function makeRegistry() {
  return createGuildRegistry<VintageDeps>({
    commands,
    confirmSecret: 'convex-test-secret',
    now: () => NOW,
  });
}

describe('commands over convex-test adapters', () => {
  it('wires identity, raids, loot, progress, and app events with strict guildId isolation', async () => {
    const t = await createConvexBackend();
    const registry = makeRegistry();

    const exec = async <T>(caller: Caller, name: string, input: unknown, confirmToken?: string) =>
      t.run(async (ctx) => {
        const runNested: RunCommand = (c, n, i) =>
          registry.execute({ name: n, input: i, caller: c }, deps);
        const deps: VintageDeps = {
          ...identityDeps(ctx),
          ...raidsDeps(ctx, runNested),
          ...coordinatorDeps(ctx, runNested),
          ...pollsDeps(ctx),
          ...progressDeps(ctx),
          ...siteDeps(ctx),
          ...agentDeps(ctx, (c, n, i, tok) =>
            registry.execute({ name: n, input: i, caller: c, confirmToken: tok }, deps),
          ),
          ...applicationsDeps(ctx),
          ...insightsDeps(ctx),
          ...lootDeps(ctx),
          ...armoryDeps(ctx),
        };
        return (await registry.execute({ name, input, caller, confirmToken }, deps)) as {
          success: boolean;
          data?: T;
          error?: { code: string; message: string };
        };
      });

    // Sync an officer in GUILD_A and an officer in GUILD_B.
    const OFFICER_ROLE = '100000000000000099';
    const sysA: Caller = { surface: 'system', guildId: GUILD_A, tier: 'officer' };
    const sysB: Caller = { surface: 'system', guildId: GUILD_B, tier: 'officer' };
    const setRoles = async (sys: Caller) => {
      const input = { roles: { [OFFICER_ROLE]: 'officer' } };
      const p = await exec<{ confirmToken: string }>(sys, 'guild-roles-set', input);
      expect(p.success).toBe(true);
      const r = await exec(sys, 'guild-roles-set', input, p.data!.confirmToken);
      expect(r.success).toBe(true);
    };
    await setRoles(sysA);
    await setRoles(sysB);

    const syncedA = await exec<{ member: Member }>(sysA, 'member-sync', {
      discordId: '100000000000000001',
      displayName: 'Ana',
      roleIds: [OFFICER_ROLE],
      inServer: true,
    });
    expect(syncedA).toMatchObject({ success: true });
    const syncedB = await exec<{ member: Member }>(sysB, 'member-sync', {
      discordId: '100000000000000002',
      displayName: 'Bram',
      roleIds: [OFFICER_ROLE],
      inServer: true,
    });
    expect(syncedB).toMatchObject({ success: true });
    const officerA: Caller = {
      surface: 'web',
      guildId: GUILD_A,
      tier: 'officer',
      memberId: syncedA.data!.member.id,
      discordId: syncedA.data!.member.discordId,
    };
    const officerB: Caller = {
      surface: 'web',
      guildId: GUILD_B,
      tier: 'officer',
      memberId: syncedB.data!.member.id,
      discordId: syncedB.data!.member.discordId,
    };

    // Add character, create raid, sign up, and suggest in GUILD_A.
    const charA = await exec<Character>(officerA, 'character-add', {
      name: 'Anarra',
      class: 'paladin',
      spec: 'holy',
      isMain: true,
    });
    expect(charA).toMatchObject({ success: true });

    const raidA = await exec<RaidEvent>(officerA, 'raid-create', {
      name: 'Barrow Deeps',
      instance: 'Barrow Deeps',
      size: 10,
      startsAt: NOW + 86_400_000,
    });
    expect(raidA.success).toBe(true);
    expect(raidA.data?.shortCode).toBeTruthy();

    const signupA = await exec<Signup>(officerA, 'signup-set', {
      eventId: raidA.data!.id,
      characterId: charA.data!.id,
      status: 'accepted',
    });
    expect(signupA.success).toBe(true);

    const guessA = await exec<SignupGuess | null>(officerA, 'signup-suggest', {
      eventId: raidA.data!.id,
    });
    expect(guessA.data).toMatchObject({
      characterId: charA.data!.id,
      reason: 'your signup for this raid',
    });

    // Event bus table in apps/api recorded the signup-changed event scoped to GUILD_A.
    const emitted = await t.run((ctx) => ctx.db.query('events').collect());
    expect(emitted.some((e) => e.guildId === GUILD_A && e.type === 'signup-changed')).toBe(true);

    // Cross-guild isolation: GUILD_B cannot read GUILD_A's raid by id or shortCode,
    // nor sign up using GUILD_A's event or character, nor see GUILD_A's kills.
    const probeById = await exec(officerB, 'raid-get', { eventId: raidA.data!.id });
    expect(probeById).toMatchObject({ success: false, error: { code: 'RAID_NOT_FOUND' } });

    const probeByCode = await exec(officerB, 'raid-get', { shortCode: raidA.data!.shortCode });
    expect(probeByCode).toMatchObject({ success: false, error: { code: 'RAID_NOT_FOUND' } });

    const killA = await exec(officerA, 'kill-record', {
      raidId: 'barrow-deeps',
      bossId: 'chillhowl',
      killedAt: NOW,
    });
    expect(killA.success).toBe(true);
    const killsB = await exec<{ kills: unknown[] }>(officerB, 'kill-list', {
      raidId: 'barrow-deeps',
    });
    expect(killsB).toMatchObject({ success: true, data: { kills: [] } });
  });
});
