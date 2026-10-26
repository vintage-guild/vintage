import type { Caller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { siteCommands } from '../src/commands';
import { type GuildProfile, STARTER_PROFILE } from '../src/contract';
import type { SiteDeps } from '../src/store';
import { createMemorySiteDeps } from '../src/testing';

const NOW = Date.UTC(2026, 9, 26, 19);

const officer = makeCaller('officer');
const leader = makeCaller('leader');
const visitor = makeCaller('public');

let deps: ReturnType<typeof createMemorySiteDeps>;
let registry: ReturnType<typeof testRegistry<SiteDeps>>;

beforeEach(() => {
  deps = createMemorySiteDeps();
  registry = testRegistry<SiteDeps>([...siteCommands], fixedClock(NOW));
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, deps);

const code = (result: Awaited<ReturnType<typeof run>>) =>
  result.success ? 'OK' : result.error?.code;

const read = async () => {
  const result = await run('guild-profile-get', {}, visitor);
  if (!result.success) throw new Error(`guild-profile-get failed: ${result.error?.code}`);
  return result.data as GuildProfile;
};

describe('guild-profile-get', () => {
  it('answers the starter profile to anyone until an officer saves one', async () => {
    expect(await read()).toEqual(STARTER_PROFILE);
  });
});

describe('guild-profile-set', () => {
  it('changes only the fields given, stamps when, and never answers who', async () => {
    const result = await run(
      'guild-profile-set',
      { pills: ['Normal', 'Tue + Thu · 9 pm ET'], discordInvite: 'https://discord.gg/vintage' },
      officer,
    );
    expect(code(result)).toBe('OK');
    const profile = await read();
    expect(profile.pills).toEqual(['Normal', 'Tue + Thu · 9 pm ET']);
    expect(profile.discordInvite).toBe('https://discord.gg/vintage');
    expect(profile.intro).toBe(STARTER_PROFILE.intro);
    expect(profile.aboutSections).toEqual(STARTER_PROFILE.aboutSections);
    expect(profile.updatedAt).toBe(NOW);
    expect(profile).not.toHaveProperty('updatedBy');
    expect(deps.site.profiles.get(officer.guildId)?.updatedBy).toBe(officer.memberId);
  });

  it('clears the invite and the contact with null', async () => {
    await run(
      'guild-profile-set',
      { discordInvite: 'https://discord.com/invite/abc-123', contactEmail: 'gm@example.com' },
      officer,
    );
    expect(await read()).toMatchObject({
      discordInvite: 'https://discord.com/invite/abc-123',
      contactEmail: 'gm@example.com',
    });
    await run('guild-profile-set', { discordInvite: null, contactEmail: null }, officer);
    expect(await read()).toMatchObject({ discordInvite: null, contactEmail: null });
  });

  it('refuses a link that is not a Discord invite, a bad email, and an empty change', async () => {
    for (const discordInvite of ['https://evil.example/discord.gg/x', 'http://discord.gg/x']) {
      expect(code(await run('guild-profile-set', { discordInvite }, officer))).toBe(
        'VALIDATION_ERROR',
      );
    }
    expect(code(await run('guild-profile-set', { contactEmail: 'not-an-email' }, officer))).toBe(
      'VALIDATION_ERROR',
    );
    expect(code(await run('guild-profile-set', { pills: [] }, officer))).toBe('VALIDATION_ERROR');
    expect(code(await run('guild-profile-set', {}, officer))).toBe('NOTHING_TO_CHANGE');
    expect((await read()).updatedAt).toBeNull();
  });

  it('is for officers: leaders and visitors are told it does not exist', async () => {
    expect(code(await run('guild-profile-set', { intro: 'x' }, leader))).toBe('COMMAND_NOT_FOUND');
    expect(code(await run('guild-profile-set', { intro: 'x' }, visitor))).toBe('COMMAND_NOT_FOUND');
  });
});
