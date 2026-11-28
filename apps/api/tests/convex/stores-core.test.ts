// Parity and cross-guild isolation tests for core Convex store adapters (#260):
// identity, raids, loot, progress, site.
import { createMemoryIdentityStore } from '@vintage/identity/testing';
import { createMemoryLootStore } from '@vintage/loot/testing';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import { createMemoryRaidsStore } from '@vintage/raids/testing';
import { createMemorySiteStore } from '@vintage/site/testing';
import { describe, expect, it } from 'vitest';
import {
  identityStore,
  lootStore,
  progressStore,
  raidsStore,
  siteStore,
} from '../../convex/stores';
import { createConvexBackend, GUILD_A, GUILD_B } from './harness';

/** Run the same contract against both the memory store and the live Convex adapter. */
function parity<Store>(
  name: string,
  createMemory: () => Store,
  createConvex: (ctx: Parameters<typeof identityStore>[0]) => Store,
  suite: (
    getStore: () => Promise<{ run: <T>(fn: (store: Store) => Promise<T>) => Promise<T> }>,
  ) => void,
) {
  describe(`${name} (memory)`, () => {
    suite(async () => {
      const store = createMemory();
      return { run: (fn) => fn(store) };
    });
  });

  describe(`${name} (convex)`, () => {
    suite(async () => {
      const t = await createConvexBackend();
      return { run: (fn) => t.run((ctx) => fn(createConvex(ctx))) };
    });
  });
}

parity('identityStore', createMemoryIdentityStore, identityStore, (setup) => {
  it('upserts members, edits prefs, manages characters, and scopes everything by guildId', async () => {
    const { run } = await setup();

    const aMember = await run((s) =>
      s.upsertMember({
        guildId: GUILD_A,
        discordId: '100000000000000001',
        displayName: 'Aeryn',
        roleIds: ['r1'],
        inServer: true,
        rank: 'raider',
        tier: 'raider',
        syncedAt: 1000,
        rankSince: 500,
      }),
    );
    const bMember = await run((s) =>
      s.upsertMember({
        guildId: GUILD_B,
        discordId: '100000000000000001',
        displayName: 'OtherAeryn',
        roleIds: ['r2'],
        inServer: true,
        rank: 'officer',
        tier: 'officer',
        syncedAt: 1000,
        rankSince: null,
      }),
    );

    await run(async (s) => {
      expect((await s.getMember(GUILD_A, aMember.id))?.displayName).toBe('Aeryn');
      expect(await s.getMember(GUILD_B, aMember.id)).toBeNull();
      expect((await s.getMemberByDiscordId(GUILD_A, '100000000000000001'))?.id).toBe(aMember.id);
      expect((await s.getMemberByDiscordId(GUILD_B, '100000000000000001'))?.id).toBe(bMember.id);
      expect((await s.listMembers(GUILD_A)).map((m) => m.id)).toEqual([aMember.id]);
      expect((await s.listMembers(GUILD_B)).map((m) => m.id)).toEqual([bMember.id]);

      const updatedPrefs = await s.setPrefs(GUILD_A, aMember.id, {
        dmOptOut: true,
        timezone: 'America/New_York',
      });
      expect(updatedPrefs.prefs).toEqual({ dmOptOut: true, timezone: 'America/New_York' });
      await expect(s.setPrefs(GUILD_B, aMember.id, { dmOptOut: false })).rejects.toThrow();

      // Characters: CRUD + cross-guild isolation
      const charA = await s.insertCharacter({
        guildId: GUILD_A,
        memberId: aMember.id,
        name: 'Aeryn',
        class: 'warrior',
        spec: 'protection',
        role: 'tank',
        alsoRoles: ['melee'],
        isMain: true,
      });
      const charB = await s.insertCharacter({
        guildId: GUILD_B,
        memberId: bMember.id,
        name: 'Brann',
        class: 'priest',
        spec: 'holy',
        role: 'healer',
        alsoRoles: [],
        isMain: true,
      });

      expect((await s.getCharacter(GUILD_A, charA.id))?.name).toBe('Aeryn');
      expect(await s.getCharacter(GUILD_B, charA.id)).toBeNull();
      expect((await s.listCharacters(GUILD_A)).map((c) => c.id)).toEqual([charA.id]);
      expect((await s.listCharacters(GUILD_A, { memberId: aMember.id })).map((c) => c.id)).toEqual([
        charA.id,
      ]);
      expect((await s.listCharacters(GUILD_B)).map((c) => c.id)).toEqual([charB.id]);

      const patched = await s.updateCharacter(GUILD_A, charA.id, { spec: 'fury', role: 'melee' });
      expect(patched).toMatchObject({ spec: 'fury', role: 'melee' });
      await expect(s.updateCharacter(GUILD_B, charA.id, { spec: 'arms' })).rejects.toThrow();

      // Cross-guild delete must not touch GUILD_A's character.
      await s.deleteCharacter(GUILD_B, charA.id);
      expect(await s.getCharacter(GUILD_A, charA.id)).not.toBeNull();
      await s.deleteCharacter(GUILD_A, charA.id);
      expect(await s.getCharacter(GUILD_A, charA.id)).toBeNull();

      // Role rank map: replace + isolation
      expect(await s.getRoleRankMap(GUILD_A)).toEqual({});
      await s.setRoleRankMap(GUILD_A, { '111': 'officer', '222': 'raider' });
      await s.setRoleRankMap(GUILD_B, { '999': 'recruit' });
      expect(await s.getRoleRankMap(GUILD_A)).toEqual({ '111': 'officer', '222': 'raider' });
      expect(await s.getRoleRankMap(GUILD_B)).toEqual({ '999': 'recruit' });
    });
  });
});

parity('raidsStore', createMemoryRaidsStore, raidsStore, (setup) => {
  it('manages schedules, events, signups, records, attendance, and absences with guildId isolation', async () => {
    const { run } = await setup();

    await run(async (s) => {
      // Schedules
      const schedA = await s.insertSchedule({
        guildId: GUILD_A,
        name: 'MC Nights',
        instance: 'Molten Core',
        kind: 'raid',
        access: 'guild',
        size: 40,
        roleTargets: null,
        recurrence: { weekdays: ['wed'], time: '20:00', timeZone: 'America/New_York' },
        durationMinutes: 180,
        timings: { leadDays: 7, reminderHours: [72, 30], digestHours: 24, lockHours: 2 },
        lootMethodId: null,
        notes: null,
        active: true,
        configVersion: 1,
      });
      await s.insertSchedule({
        guildId: GUILD_B,
        name: 'BWL Nights',
        instance: 'Blackwing Lair',
        kind: 'raid',
        access: 'guild',
        size: 40,
        roleTargets: null,
        recurrence: { weekdays: ['thu'], time: '20:00', timeZone: 'America/New_York' },
        durationMinutes: 180,
        timings: { leadDays: 7, reminderHours: [72, 30], digestHours: 24, lockHours: 2 },
        lootMethodId: null,
        notes: null,
        active: false,
        configVersion: 1,
      });

      expect((await s.listSchedules(GUILD_A)).map((x) => x.id)).toEqual([schedA.id]);
      expect(await s.getSchedule(GUILD_B, schedA.id)).toBeNull();
      await expect(s.updateSchedule(GUILD_B, schedA.id, { active: false })).rejects.toThrow();

      // Events & shortCode lookup
      const evA = await s.insertEvent({
        guildId: GUILD_A,
        scheduleId: schedA.id,
        name: 'MC #1',
        instance: 'Molten Core',
        kind: 'raid',
        access: 'guild',
        size: 40,
        startsAt: 10_000,
        durationMinutes: 180,
        status: 'open',
        roleTargets: null,
        lootMethodId: null,
        notes: null,
        rosterApprovedAt: null,
        rosterApprovedBy: null,
        configVersion: 1,
      });
      const evB = await s.insertEvent({
        guildId: GUILD_B,
        scheduleId: null,
        name: 'Other MC',
        instance: 'Molten Core',
        kind: 'raid',
        access: 'open',
        size: 40,
        startsAt: 20_000,
        durationMinutes: 180,
        status: 'open',
        roleTargets: null,
        lootMethodId: null,
        notes: null,
        rosterApprovedAt: null,
        rosterApprovedBy: null,
        configVersion: 1,
      });

      expect(evA.shortCode).toBeTruthy();
      expect((await s.getEventByShortCode(GUILD_A, evA.shortCode!.toUpperCase()))?.id).toBe(evA.id);
      expect(await s.getEventByShortCode(GUILD_B, evA.shortCode!)).toBeNull();
      expect(await s.getEvent(GUILD_B, evA.id)).toBeNull();
      expect((await s.listEvents(GUILD_A)).map((e) => e.id)).toEqual([evA.id]);
      expect((await s.listEvents(GUILD_B)).map((e) => e.id)).toEqual([evB.id]);
      await expect(s.updateEvent(GUILD_B, evA.id, { status: 'locked' })).rejects.toThrow();

      // Signups & member history ordering
      const s1 = await s.insertSignup({
        guildId: GUILD_A,
        eventId: evA.id,
        memberId: 'm1',
        characterId: 'c1',
        characterName: 'Aeryn',
        class: 'warrior',
        spec: 'protection',
        role: 'tank',
        alsoRoles: [],
        status: 'accepted',
        lateMinutes: null,
        note: null,
        signedUpAt: 100,
        updatedAt: 100,
        updatedBy: null,
        roster: 'pending',
        group: null,
        queued: false,
        promotedAt: null,
      });
      const evA2 = await s.insertEvent({
        guildId: GUILD_A,
        scheduleId: schedA.id,
        name: 'MC #2',
        instance: 'Molten Core',
        kind: 'raid',
        access: 'guild',
        size: 40,
        startsAt: 30_000,
        durationMinutes: 180,
        status: 'open',
        roleTargets: null,
        lootMethodId: null,
        notes: null,
        rosterApprovedAt: null,
        rosterApprovedBy: null,
        configVersion: 1,
      });
      const s2 = await s.insertSignup({
        guildId: GUILD_A,
        eventId: evA2.id,
        memberId: 'm1',
        characterId: 'c2',
        characterName: 'Aeralt',
        class: 'mage',
        spec: 'frost',
        role: 'ranged',
        alsoRoles: [],
        status: 'accepted',
        lateMinutes: null,
        note: null,
        signedUpAt: 200,
        updatedAt: 200,
        updatedBy: null,
        roster: 'pending',
        group: null,
        queued: false,
        promotedAt: null,
      });

      expect((await s.listSignupsByMember(GUILD_A, 'm1', 1)).map((x) => x.id)).toEqual([s2.id]);
      expect(await s.listSignupsByMember(GUILD_B, 'm1', 5)).toEqual([]);
      expect(await s.getSignup(GUILD_B, s1.id)).toBeNull();
      expect(await s.getSignupByMember(GUILD_B, evA.id, 'm1')).toBeNull();
      await expect(s.updateSignup(GUILD_B, s1.id, { status: 'declined' })).rejects.toThrow();
      await s.deleteSignup(GUILD_B, s1.id);
      expect(await s.getSignup(GUILD_A, s1.id)).not.toBeNull();

      // Records & attendance (including listAttendanceByMember from #185)
      await s.putRecord(
        {
          guildId: GUILD_A,
          eventId: evA.id,
          exportKey: 'Aeryn@1000',
          exporter: 'Aeryn',
          exportedAt: 1000,
          addonVersion: '0.2.0',
          snapshots: 2,
          attended: 1,
          drops: 0,
          bosses: null,
          recordedBy: 'officer',
          recordedAt: 1000,
        },
        [
          {
            name: 'Aeryn',
            class: 'warrior',
            characterId: 'c1',
            memberId: 'm1',
            snapshots: 2,
            labels: ['start', 'end'],
            firstSeenAt: 1000,
            lastSeenAt: 2000,
          },
        ],
      );
      await s.putRecord(
        {
          guildId: GUILD_A,
          eventId: evA2.id,
          exportKey: 'Aeryn@5000',
          exporter: 'Aeryn',
          exportedAt: 5000,
          addonVersion: '0.2.0',
          snapshots: 1,
          attended: 1,
          drops: 0,
          bosses: null,
          recordedBy: 'officer',
          recordedAt: 5000,
        },
        [
          {
            name: 'Aeralt',
            class: 'mage',
            characterId: 'c2',
            memberId: 'm1',
            snapshots: 0,
            labels: [],
            firstSeenAt: 5000,
            lastSeenAt: 5000,
            stoodBy: true,
          },
        ],
      );
      expect((await s.getRecord(GUILD_A, evA.id))?.exportKey).toBe('Aeryn@1000');
      expect(await s.getRecord(GUILD_B, evA.id)).toBeNull();
      expect((await s.listAttendance(GUILD_A, evA.id)).map((a) => a.name)).toEqual(['Aeryn']);
      expect(await s.listAttendance(GUILD_B, evA.id)).toEqual([]);
      expect((await s.listAttendanceByMember(GUILD_A, 'm1', 1)).map((a) => a.characterId)).toEqual([
        'c2',
      ]);
      expect(await s.listAttendanceByMember(GUILD_B, 'm1', 5)).toEqual([]);

      // Absences
      const absA = await s.insertAbsence({
        guildId: GUILD_A,
        memberId: 'm1',
        kind: 'dates',
        from: '2026-12-01',
        to: '2026-12-05',
        nights: null,
        timeZone: 'America/New_York',
        reason: 'travel',
        createdBy: 'm1',
        createdAt: 1000,
        endedAt: null,
      });
      expect(await s.getAbsence(GUILD_B, absA.id)).toBeNull();
      expect(await s.listAbsences(GUILD_B)).toEqual([]);
      await expect(s.endAbsence(GUILD_B, absA.id, 2000)).rejects.toThrow();
      const ended = await s.endAbsence(GUILD_A, absA.id, 2000);
      expect(ended.endedAt).toBe(2000);
      expect(await s.listAbsences(GUILD_A, { activeOnly: true })).toEqual([]);
      expect(await s.listAbsences(GUILD_A, { activeOnly: false })).toHaveLength(1);
    });
  });
});

parity('lootStore', createMemoryLootStore, lootStore, (setup) => {
  it('stores drops, method configs, and awards scoped by guildId', async () => {
    const { run } = await setup();

    await run(async (s) => {
      await s.replaceDrops(GUILD_A, 'ev1', [
        {
          itemId: 16800,
          itemName: 'Arcanist Boots',
          looter: 'Bramble',
          characterId: 'c1',
          memberId: 'm1',
          count: 1,
          source: 'Lucifron',
          at: 1000,
          lootMethodId: 'msos',
          recordedAt: 2000,
        },
      ]);
      expect(await s.listDrops(GUILD_A, 'ev1')).toHaveLength(1);
      expect(await s.listDrops(GUILD_B, 'ev1')).toEqual([]);

      // Replacing drops in GUILD_B must not clear GUILD_A's drops.
      await s.replaceDrops(GUILD_B, 'ev1', []);
      expect(await s.listDrops(GUILD_A, 'ev1')).toHaveLength(1);

      await s.upsertMethodConfig({
        guildId: GUILD_A,
        methodId: 'msos',
        methodVersion: 1,
        configVersion: 1,
        config: { allowOffspec: true },
        state: {},
        updatedAt: 1000,
        updatedBy: 'm1',
      });
      expect((await s.getMethodConfig(GUILD_A, 'msos'))?.methodId).toBe('msos');
      expect(await s.getMethodConfig(GUILD_B, 'msos')).toBeNull();
      expect(await s.listMethodConfigs(GUILD_B)).toEqual([]);

      await s.insertAward({
        guildId: GUILD_A,
        eventId: 'ev1',
        itemId: 16800,
        itemName: 'Arcanist Boots',
        characterId: 'c1',
        characterName: 'Bramble',
        memberId: 'm1',
        methodId: 'msos',
        methodVersion: 1,
        configVersion: 1,
        intent: 'mainspec',
        roll: null,
        note: 'BiS',
        awardedBy: 'officer',
        awardedAt: 3000,
      });
      expect(await s.listAwards(GUILD_A, { eventId: 'ev1' })).toHaveLength(1);
      expect(await s.listAwards(GUILD_B, { eventId: 'ev1' })).toEqual([]);
    });
  });
});

parity('progressStore', createMemoryProgressStore, progressStore, (setup) => {
  it('inserts, reads, lists, and deletes kills with guildId isolation', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const k1 = await s.insertKill({
        guildId: GUILD_A,
        raidId: 'barrow-deeps',
        bossId: 'chillhowl',
        killedAt: 5000,
        note: 'First kill',
        loot: [{ name: 'Frost Edge', quality: 'epic' }],
        recordedBy: 'officer',
        recordedAt: 5001,
      });
      expect((await s.getKill(GUILD_A, k1.id))?.bossId).toBe('chillhowl');
      expect(await s.getKill(GUILD_B, k1.id)).toBeNull();
      expect(await s.listKills(GUILD_A, { raidId: 'barrow-deeps' })).toHaveLength(1);
      expect(await s.listKills(GUILD_B, { raidId: 'barrow-deeps' })).toEqual([]);

      // Cross-guild delete is a no-op.
      await s.deleteKill(GUILD_B, k1.id);
      expect(await s.getKill(GUILD_A, k1.id)).not.toBeNull();
      await s.deleteKill(GUILD_A, k1.id);
      expect(await s.getKill(GUILD_A, k1.id)).toBeNull();
    });
  });
});

parity('siteStore', createMemorySiteStore, siteStore, (setup) => {
  it('stores recruiting needs and guild profile isolated per guild', async () => {
    const { run } = await setup();

    await run(async (s) => {
      expect(await s.getRecruiting(GUILD_A)).toBeNull();
      await s.putRecruiting({
        guildId: GUILD_A,
        headline: 'Recruiting healers',
        pitch: 'Wed/Thu raids',
        needs: [{ wowClass: 'priest', role: 'healer', specs: 'holy', need: 'high' }],
        updatedAt: 1000,
        updatedBy: 'officer',
      });
      expect((await s.getRecruiting(GUILD_A))?.headline).toBe('Recruiting healers');
      expect(await s.getRecruiting(GUILD_B)).toBeNull();

      expect(await s.getProfile(GUILD_A)).toBeNull();
      await s.putProfile({
        guildId: GUILD_A,
        pills: ['Wed/Thu'],
        intro: 'Vintage on Forever',
        aboutLead: 'Raid twice a week.',
        aboutSections: [{ heading: 'Schedule', body: 'Wed & Thu 8pm' }],
        discordInvite: 'https://discord.gg/vintage',
        contactEmail: null,
        updatedAt: 1000,
        updatedBy: 'officer',
      });
      expect((await s.getProfile(GUILD_A))?.intro).toBe('Vintage on Forever');
      expect(await s.getProfile(GUILD_B)).toBeNull();
    });
  });
});

describe('siteStore (convex) with lines saved before roles existed', () => {
  it('reads a line without a role as any', async () => {
    const t = await createConvexBackend();
    const needs = await t.run(async (ctx) => {
      const s = siteStore(ctx);
      await s.putRecruiting({
        guildId: GUILD_A,
        headline: 'Healers',
        pitch: 'Wed/Thu raids',
        // The shape every line had before roles: no role at all.
        needs: [{ wowClass: 'priest', specs: 'holy', need: 'high' } as never],
        updatedAt: 1000,
        updatedBy: 'officer',
      });
      return (await s.getRecruiting(GUILD_A))?.needs;
    });
    expect(needs).toEqual([{ wowClass: 'priest', role: 'any', specs: 'holy', need: 'high' }]);
  });
});
