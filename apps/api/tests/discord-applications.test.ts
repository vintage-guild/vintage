import { applicationsCommands } from '@vintage/applications/commands';
import type { Application } from '@vintage/applications/contract';
import { createMemoryApplicationsDeps } from '@vintage/applications/testing';
import { raiseNeedCustomId } from '@vintage/coordinator/commands';
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import type { Caller, Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { siteCommands } from '@vintage/site/commands';
import { createMemorySiteDeps } from '@vintage/site/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type ApplicationDiscordPorts,
  handleApplicationInteraction,
} from '../src/discord-applications';

const GUILD = 'guild-test';
const SERVER = '600000000000000001';

const member = (id: string, tier: Tier): Member => ({
  id,
  guildId: GUILD,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
});
const MEMBERS = [member('vex', 'officer'), member('rook', 'leader'), member('pip', 'member')];

type Deps = ReturnType<typeof createMemoryApplicationsDeps>['deps'] &
  ReturnType<typeof createMemorySiteDeps>;

let deps: Deps;
let effects: ReturnType<typeof createMemoryApplicationsDeps>['effects'];
let ports: ApplicationDiscordPorts;

beforeEach(() => {
  const apps = createMemoryApplicationsDeps();
  effects = apps.effects;
  deps = { ...apps.deps, ...createMemorySiteDeps() };
  const registry = testRegistry<Deps>(
    [...applicationsCommands, ...siteCommands],
    fixedClock(Date.UTC(2026, 9, 27, 19)),
  );
  ports = {
    discordGuildId: SERVER,
    guildId: GUILD,
    siteUrl: 'https://vintageguild.gg',
    memberByDiscordId: async (id) => MEMBERS.find((m) => m.discordId === id) ?? null,
    run: (caller: Caller, name, input, confirmToken) =>
      registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
  };
});

const base = (userId: string) => ({
  id: 'i',
  application_id: 'app',
  token: 'tok',
  version: 1,
  guild_id: SERVER,
  channel_id: '400000000000000009',
  member: { user: { id: userId, username: userId, global_name: `${userId}-name` } },
});

const slash = (userId: string, sub: string, options: Record<string, string> = {}) =>
  ({
    ...base(userId),
    type: InteractionType.APPLICATION_COMMAND,
    data: {
      name: 'random',
      options: [
        {
          name: sub,
          type: 1,
          options: Object.entries(options).map(([name, value]) => ({ name, type: 3, value })),
        },
      ],
    },
  }) as unknown as Interaction;

const component = (userId: string, customId: string, extra: object = {}) =>
  ({
    ...base(userId),
    type: InteractionType.MESSAGE_COMPONENT,
    data: { custom_id: customId, component_type: 2 },
    ...extra,
  }) as unknown as Interaction;

const modalSubmit = (userId: string, customId: string, values: Record<string, string>) =>
  ({
    ...base(userId),
    type: InteractionType.MODAL_SUBMIT,
    data: {
      custom_id: customId,
      components: Object.entries(values).map(([id, value]) => ({
        type: 1,
        components: [{ type: 4, custom_id: id, value }],
      })),
    },
  }) as unknown as Interaction;

const content = (r: unknown) => JSON.stringify(r);

async function apply(userId = 'd-guest') {
  const opened = (await handleApplicationInteraction(
    slash(userId, 'apply', {
      character: 'Kol',
      class: 'shaman',
      spec: 'restoration',
      role: 'raider',
    }),
    ports,
  )) as { type: number; data: { custom_id: string } };
  expect(opened.type).toBe(9);
  return handleApplicationInteraction(
    modalSubmit(userId, opened.data.custom_id, {
      about: 'Healer since vanilla.',
      experience: 'MC and BWL.',
      availability: 'Tue and Thu',
    }),
    ports,
  );
}

const only = () => [...deps.applications.rows.values()][0] as Application;

describe('/random apply', () => {
  it('opens the modal, then submits as the Discord user, even before they are a member', async () => {
    const response = await apply();
    expect(content(response)).toMatch(/Thanks! Your application is with the officers/);
    expect(only()).toMatchObject({
      discordId: 'd-guest',
      applicantName: 'd-guest-name',
      characterName: 'Kol',
      wowClass: 'shaman',
      role: 'raider',
      about: 'Healer since vanilla.',
    });
    expect(effects).toEqual([{ effect: 'submitted', applicationId: only().id }]);
  });

  it('refuses a second open application before the form', async () => {
    await apply();
    const again = await handleApplicationInteraction(
      slash('d-guest', 'apply', { character: 'Kol', class: 'shaman', spec: 'restoration' }),
      ports,
    );
    expect(content(again)).toMatch(/"type":4/);
    expect(content(again)).toMatch(/Your application is still with the officers/);
  });

  it('refuses a raider before the form', async () => {
    const response = await handleApplicationInteraction(
      slash('d-vex', 'apply', { character: 'Vex', class: 'warrior', spec: 'arms' }),
      ports,
    );
    expect(content(response)).toMatch(/"type":4/);
    expect(content(response)).toMatch(/You already raid with Vintage/);
  });

  it('only answers in the guild server', async () => {
    const elsewhere = { ...slash('d-guest', 'apply', {}), guild_id: '999' } as Interaction;
    expect(content(await handleApplicationInteraction(elsewhere, ports))).toMatch(
      /Vintage guild server/,
    );
  });
});

describe('officer buttons', () => {
  it('Accept reviews as the officer and redraws the post without buttons', async () => {
    await apply();
    const response = await handleApplicationInteraction(
      component('d-vex', `app:ok:${only().id}`),
      ports,
    );
    expect(only()).toMatchObject({ status: 'accepted', reviewedBy: 'vex' });
    expect(content(response)).toMatch(/"type":7/);
    expect(content(response)).toMatch(/"components":\[\]/);
    expect(effects.map((e) => e.effect)).toContain('accepted');
  });

  it('Reply opens a modal; its submit records the reply and moves it to review', async () => {
    await apply();
    const opened = await handleApplicationInteraction(
      component('d-vex', `app:re:${only().id}`),
      ports,
    );
    expect(content(opened)).toMatch(/"type":9/);
    await handleApplicationInteraction(
      modalSubmit('d-vex', `app:rs:${only().id}`, { reply: 'Can you do Sundays?' }),
      ports,
    );
    expect(only()).toMatchObject({ status: 'in-review', reply: 'Can you do Sundays?' });
    expect(effects.map((e) => e.effect)).toContain('replied');
  });

  it('Decline previews, then declines on the confirm click', async () => {
    await apply();
    const preview = await handleApplicationInteraction(
      component('d-vex', `app:no:${only().id}`),
      ports,
    );
    expect(content(preview)).toMatch(/Confirm decline/);
    expect(only().status).toBe('new');
    await handleApplicationInteraction(component('d-vex', `app:nn:${only().id}`), ports);
    expect(only().status).toBe('declined');
  });

  it('refuses everyone below officer', async () => {
    await apply();
    const byLeader = await handleApplicationInteraction(
      component('d-rook', `app:ok:${only().id}`),
      ports,
    );
    expect(content(byLeader)).toMatch(/Only officers answer applications/);
    expect(only().status).toBe('new');
  });
});

describe('recruiting', () => {
  it('/random recruiting: leaders post it for the channel, others see it privately', async () => {
    const byLeader = await handleApplicationInteraction(slash('d-rook', 'recruiting'), ports);
    expect(content(byLeader)).toMatch(/Vintage is recruiting/);
    expect(content(byLeader)).not.toMatch(/"flags":64/);
    const byMember = await handleApplicationInteraction(slash('d-pip', 'recruiting'), ports);
    expect(content(byMember)).toMatch(/"flags":64/);
  });

  it('the assessment button raises one class to high, officers only', async () => {
    const byLeader = await handleApplicationInteraction(
      component('d-rook', raiseNeedCustomId('priest')),
      ports,
    );
    expect(content(byLeader)).toMatch(/Only officers change recruiting needs/);
    const done = await handleApplicationInteraction(
      component('d-vex', raiseNeedCustomId('priest')),
      ports,
    );
    expect(content(done)).toMatch(/Priest is now a high need on the site/);
    const band = await deps.site.getRecruiting(GUILD);
    expect(band?.needs.find((n) => n.wowClass === 'priest')?.need).toBe('high');
  });
});
