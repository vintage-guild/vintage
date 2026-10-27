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
import { createHost, DAY, OPS_CHANNEL, ROLES, SIGNUP_CHANNEL, SITE_URL } from './host';

/** Mon 26 Oct 2026, 2 PM New York: before launch, while the guild is recruiting. */
const NOW = Date.UTC(2026, 9, 26, 18);

describe('JTBD: applications and the weekly check', () => {
  const GUEST = '500000000000000050';
  const answers = {
    about: 'Healer since vanilla, calm on voice.',
    experience: 'Cleared MC and BWL as main heals.',
    availability: 'Tue and Thu evenings',
  };

  it('J28 · a player applies from Discord, an officer replies and accepts', async () => {
    const host = createHost(NOW);
    const ana = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const rook = await host.discordMember('500000000000000002', 'Rook', [ROLES.raidLeader]);

    // Not in the guild yet: Thrall applies anyway.
    const sent = await host.applicationUi.apply(
      GUEST,
      { character: 'Thrall', class: 'shaman', spec: 'restoration', role: 'raider' },
      answers,
    );
    expect(JSON.stringify(sent)).toMatch(/Your application is with the officers/);
    const [application] = await host.ok<{ id: string; status: string; applicantName: string }[]>(
      ana,
      'application-list',
    );
    expect(application).toMatchObject({ status: 'new', applicantName: `${GUEST}-name` });
    expect(host.applicationEffects).toEqual([{ effect: 'submitted', id: application!.id }]);

    // A second application while this one is open is refused with the reason.
    expect(
      JSON.stringify(
        await host.applicationUi.apply(
          GUEST,
          { character: 'Thrall', class: 'shaman', spec: 'restoration', role: 'raider' },
          answers,
        ),
      ),
    ).toMatch(/still with the officers/);

    // Only officers answer; Ana accepts. The post refreshes; onboarding waits for the role.
    expect(
      JSON.stringify(await host.applicationUi.click(rook.discordId!, `app:ok:${application!.id}`)),
    ).toMatch(/Only officers answer applications/);
    await host.applicationUi.click(ana.discordId!, `app:ok:${application!.id}`);
    expect(host.applicationEffects.map((e) => e.effect)).toEqual([
      'submitted',
      'changed',
      'accepted',
    ]);
    const visitor = await host.as(GUEST);
    expect(await host.ok<{ status: string }>(visitor, 'application-get')).toMatchObject({
      status: 'accepted',
    });
  });

  it('J29 · officers get one weekly roster check, and a click raises a class on the site', async () => {
    const host = createHost(NOW);
    const ana = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const rook = await host.discordMember('500000000000000002', 'Rook', [ROLES.raidLeader]);
    await host.configureCoordinator({
      signupChannelId: SIGNUP_CHANNEL,
      opsChannelId: OPS_CHANNEL,
      weeklyAssessment: true,
    });
    await host.ok(rook, 'raid-create', {
      name: 'Molten Core',
      instance: 'Molten Core',
      size: 20,
      startsAt: NOW + 3 * DAY,
    });
    await host.tick();
    await host.tick();
    const checks = host
      .sentTo(OPS_CHANNEL)
      .filter((m) => m.message.content?.includes('Weekly roster check'));
    expect(checks).toHaveLength(1);
    const buttons = JSON.stringify(checks[0]?.message.components ?? []);
    // The starter band has priests and shamans at high already; druids (medium) can tank or heal.
    expect(buttons).toMatch(/recruit:hi:druid/);
    expect(buttons).not.toMatch(/recruit:hi:priest/);

    expect(
      JSON.stringify(await host.applicationUi.click(rook.discordId!, 'recruit:hi:druid')),
    ).toMatch(/Only officers change recruiting needs/);
    await host.applicationUi.click(ana.discordId!, 'recruit:hi:druid');
    const band = await host.ok<Recruiting>(ana, 'recruiting-get');
    expect(band.needs.find((n) => n.wowClass === 'druid')?.need).toBe('high');
  });
});

describe('JTBD: apply, get accepted, get onboarded', () => {
  const THRALL = '500000000000000060';
  const JAINA = '500000000000000061';
  const BREN = '500000000000000062';
  const form = (character: string, classSpec: string) => ({
    character,
    'class-spec': classSpec,
    about: 'Healer since vanilla, calm on voice.',
    experience: 'Cleared MC and BWL as main heals.',
    availability: 'Tue and Thu evenings',
  });
  const text = (r: unknown) => JSON.stringify(r);

  it('J34 · a player applies from the recruiting post, is accepted, and is onboarded once', async () => {
    const host = createHost(NOW);
    const ana = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const rook = await host.discordMember('500000000000000002', 'Rook', [ROLES.raidLeader]);
    const dmsTo = (id: string) => host.discord.sent.filter((m) => m.kind === 'dm' && m.to === id);

    // Rook posts the recruiting embed: the open needs from recruiting-get, and Apply buttons.
    const post = text(await host.applicationUi.recruiting(rook.discordId!));
    expect(post).toMatch(/Vintage is recruiting/);
    expect(post).toMatch(new RegExp(STARTER_RECRUITING.headline.slice(0, 20)));
    expect(post).toMatch(/Apply as a raider/);

    // Thrall is in the server with no roles. He applies with the button and the form.
    await host.discordMember(THRALL, 'Thrall', []);
    const sent = await host.applicationUi.applyFromPost(
      THRALL,
      'app:start:0',
      form('Thrall', 'Restoration Shaman'),
    );
    expect(text(sent)).toMatch(/Your application is with the officers/);

    // Ana reviews it in the quarters (the same commands): list, detail, then asks for more.
    const [listed] = await host.ok<{ id: string; status: string }[]>(ana, 'application-list');
    const id = listed!.id;
    expect(await host.ok(ana, 'application-get', { applicationId: id })).toMatchObject({
      characterName: 'Thrall',
      wowClass: 'shaman',
      role: 'raider',
    });
    await host.applicationUi.askMore(ana.discordId!, `app:rs:${id}`, 'Can you do Sundays?');
    const thrall = await host.as(THRALL);
    expect(await host.ok(thrall, 'application-get')).toMatchObject({
      status: 'in-review',
      reply: 'Can you do Sundays?',
    });

    // Ana accepts in Discord: privately told which role to give. No DM yet: no role yet.
    const accepted = text(await host.applicationUi.click(ana.discordId!, `app:ok:${id}`));
    expect(accepted).toContain(`Give them <@&${ROLES.recruit}> in Discord`);
    expect(accepted).toMatch(/"flags":64/);
    await host.discordMember(THRALL, 'Thrall', []);
    expect(dmsTo(THRALL)).toEqual([]);

    // An officer gives the recruit role; role sync promotes Thrall, and Random DMs him once.
    await host.discordMember(THRALL, 'Thrall', [ROLES.recruit]);
    expect(await host.ok(await host.as(THRALL), 'member-me')).toMatchObject({
      member: { rank: 'recruit' },
    });
    expect(dmsTo(THRALL)).toHaveLength(1);
    expect(text(dmsTo(THRALL)[0]!.message)).toContain(SITE_URL);
    await host.discordMember(THRALL, 'Thrall', [ROLES.raider]);
    expect(dmsTo(THRALL)).toHaveLength(1);
  });

  it('J34 · the role given before Accept still onboards; the DM opt-out is honored', async () => {
    const host = createHost(NOW);
    const ana = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const dmsTo = (id: string) => host.discord.sent.filter((m) => m.kind === 'dm' && m.to === id);
    const accept = async (discordId: string) => {
      const [latest] = await host.ok<{ id: string; discordId: string }[]>(ana, 'application-list');
      expect(latest!.discordId).toBe(discordId);
      return host.ok(ana, 'application-review', { applicationId: latest!.id, status: 'accepted' });
    };

    // Jaina gets the recruit role before anyone presses Accept: Accept onboards her at once.
    await host.applicationUi.applyFromPost(JAINA, 'app:start:0', form('Jaina', 'Frost Mage'));
    await host.discordMember(JAINA, 'Jaina', [ROLES.recruit]);
    expect(dmsTo(JAINA)).toEqual([]);
    expect(await accept(JAINA)).toMatchObject({ giveRole: { roleId: ROLES.recruit } });
    expect(dmsTo(JAINA)).toHaveLength(1);

    // Bren, a social member, turned DMs off: promoted after Accept, no DM, and none later.
    const bren = await host.discordMember(BREN, 'Bren', [ROLES.member]);
    await host.ok(bren, 'member-prefs-set', { dmOptOut: true });
    await host.applicationUi.applyFromPost(BREN, 'app:start:1', form('Bren', 'Fury Warrior'));
    await accept(BREN);
    await host.discordMember(BREN, 'Bren', [ROLES.recruit]);
    await host.ok(await host.as(BREN), 'member-prefs-set', { dmOptOut: false });
    await host.discordMember(BREN, 'Bren', [ROLES.member]);
    await host.discordMember(BREN, 'Bren', [ROLES.recruit]);
    expect(dmsTo(BREN)).toEqual([]);
  });
});

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
