// JTBD: recruiting (docs/jtbd/recruiting.md). An officer edits the open roles; the public band
// and every surface read the change at once. Driven only through commands.
import type { Caller } from '@vintage/guild-kit';
import {
  type GuildProfile,
  type Recruiting,
  STARTER_PROFILE,
  STARTER_RECRUITING,
} from '@vintage/site/contract';
import { describe, expect, it } from 'vitest';
import { createHost, ROLES } from './host';

/** Mon 26 Oct 2026, 2 PM New York: before launch, while the guild is recruiting. */
const NOW = Date.UTC(2026, 9, 26, 18);

describe('JTBD: recruiting', () => {
  it('J21 · an officer edits the open roles and the public band changes without a deploy', async () => {
    const host = createHost(NOW);
    const join = (id: string, name: string, role: string) =>
      host.discordMember(`50000000000000000${id}`, name, [role]);
    const ana = await join('1', 'Ana', ROLES.officer);
    const rook = await join('2', 'Rook', ROLES.raidLeader);
    const visitor = await host.as('500000000000000099');
    const band = (who: Caller) => host.ok<Recruiting>(who, 'recruiting-get');

    // Before anyone saves, a visitor sees the starter band, marked as never saved.
    expect(await band(visitor)).toEqual(STARTER_RECRUITING);

    // We have our tanks; healers are now the ask, and hunters are welcome again.
    await host.ok(ana, 'recruiting-set', {
      headline: 'Two healers for the twenties, and that is the list.',
      needs: [
        { wowClass: 'priest', specs: 'holy · discipline', need: 'high' },
        { wowClass: 'druid', specs: 'restoration', need: 'high' },
        { wowClass: 'hunter', need: 'medium' },
        { wowClass: 'warrior', specs: 'protection', need: 'closed' },
      ],
    });

    // The visitor's next read is the new band; the pitch Ana left out is unchanged.
    const now = await band(visitor);
    expect(now.headline).toBe('Two healers for the twenties, and that is the list.');
    expect(now.pitch).toBe(STARTER_RECRUITING.pitch);
    expect(now.needs.filter((n) => n.need === 'high').map((n) => n.wowClass)).toEqual([
      'priest',
      'druid',
    ]);
    expect(now.needs.find((n) => n.wowClass === 'hunter')).toEqual({
      wowClass: 'hunter',
      specs: 'any',
      need: 'medium',
    });
    expect(now.updatedAt).toBe(NOW);

    // A raid leader can read the band in the quarters but not change it.
    const refused = await host.run(rook, 'recruiting-set', { headline: 'Rogues!' });
    expect(refused.success ? 'OK' : refused.error?.code).toBe('COMMAND_NOT_FOUND');
    expect((await band(rook)).headline).toBe(now.headline);
  });

  it('J23 · an officer sets the guild’s public words and the invite, and visitors see them', async () => {
    const host = createHost(NOW);
    const ana = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const rook = await host.discordMember('500000000000000002', 'Rook', [ROLES.raidLeader]);
    const visitor = await host.as('500000000000000099');
    const profile = (who: Caller) => host.ok<GuildProfile>(who, 'guild-profile-get');

    // Before anyone saves, the site shows the starter words and has no invite or contact.
    expect(await profile(visitor)).toEqual(STARTER_PROFILE);

    await host.ok(ana, 'guild-profile-set', {
      pills: ['Normal ruleset', 'Wed + Thu · 8 pm ET', 'Semi-hardcore'],
      intro: 'Old raiders, new realm.',
      discordInvite: 'https://discord.gg/vintage',
      contactEmail: 'officers@example.com',
    });

    const now = await profile(visitor);
    expect(now).toMatchObject({
      pills: ['Normal ruleset', 'Wed + Thu · 8 pm ET', 'Semi-hardcore'],
      intro: 'Old raiders, new realm.',
      discordInvite: 'https://discord.gg/vintage',
      contactEmail: 'officers@example.com',
      updatedAt: NOW,
    });
    expect(now.aboutSections).toEqual(STARTER_PROFILE.aboutSections);

    // Not any link: the invite must be Discord's.
    const phishing = await host.run(ana, 'guild-profile-set', {
      discordInvite: 'https://discord.gg.example.com/x',
    });
    expect(phishing.success ? 'OK' : phishing.error?.code).toBe('VALIDATION_ERROR');

    // A raid leader reads the profile in the quarters but can't change it.
    const refused = await host.run(rook, 'guild-profile-set', { intro: 'Rogues!' });
    expect(refused.success ? 'OK' : refused.error?.code).toBe('COMMAND_NOT_FOUND');
    expect((await profile(rook)).intro).toBe('Old raiders, new realm.');
  });
});
