// JTBD: armory (docs/jtbd/armory.md). A member links a registered character to its WoW: Forever
// armory entry and the guild sees its level, item level, and gear. Driven only through commands;
// Blizzard is a fake fetch behind the real Forever API client, so its parsing runs too.
import type { ArmoryEntry, ArmoryLink } from '@vintage/armory/contract';
import { createForeverApi, type FetchLike } from '@vintage/forever-api';
import type { Caller } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHost, type Host, ROLES } from './host';

/** Sat 7 Nov 2026, 15:00 New York: three days after Forever launched. */
const NOW = Date.UTC(2026, 10, 7, 20);
const MINUTE = 60 * 1000;

/** What the fake armory knows, by slug; anything else is a 404 like Blizzard's. */
const ARMORY: Record<string, unknown> = {
  'pipwick-thornbury': {
    id: 3889172,
    name: 'Pipwick',
    surname: 'Thornbury',
    level: 42,
    character_class: { id: 8, name: 'Mage' },
    race: { id: 7, name: 'Gnome' },
    faction: { type: 'ALLIANCE', name: 'Alliance' },
    guild: { name: 'Vintage', slug: 'vintage' },
    equipped_item_level: 39,
    average_item_level: 40,
    last_login_timestamp: NOW - 3 * 60 * MINUTE,
  },
  'pipwick-thornbury/equipment': {
    equipped_items: [
      {
        item: { id: 7709 },
        slot: { type: 'CHEST', name: 'Chest' },
        quality: { type: 'RARE', name: 'Rare' },
        name: 'Blue Overalls',
        level: { value: 40 },
      },
    ],
  },
  'pipwick-thornbury/character-media': {
    assets: [{ key: 'avatar', value: 'https://render.worldofwarcraft.com/us/pipwick-avatar.jpg' }],
  },
};

function fakeBlizzard() {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    if (url.startsWith('https://oauth.battle.net/')) {
      return Response.json({ access_token: 'tok', expires_in: 86399 });
    }
    const path = new URL(url).pathname.replace('/profile/wow/character/', '');
    const body = ARMORY[decodeURIComponent(path)];
    return body ? Response.json(body) : Response.json({ code: 404 }, { status: 404 });
  };
  return {
    calls,
    api: createForeverApi({ region: 'us', clientId: 'id', clientSecret: 's', fetch }),
  };
}

interface Guild {
  host: Host;
  aeryn: Caller; // raider
  pip: Caller; // member
  ana: Caller; // officer
}

async function createGuild(): Promise<Guild> {
  const host = createHost(NOW);
  const join = (id: string, name: string, role: string) =>
    host.discordMember(`50000000000000000${id}`, name, [role]);
  return {
    host,
    ana: await join('1', 'Ana', ROLES.officer),
    aeryn: await join('3', 'Aeryn', ROLES.raider),
    pip: await join('7', 'Pip', ROLES.member),
  };
}

describe('JTBD: armory', () => {
  let g: Guild;
  beforeEach(async () => {
    g = await createGuild();
  });

  it('J49 · a member links a character to the armory and the guild sees its gear', async () => {
    const { host, pip, aeryn, ana } = g;
    const blizzard = fakeBlizzard();
    const mage = await host.ok<Character>(pip, 'character-add', {
      name: 'Pipwick',
      class: 'mage',
      spec: 'frost',
    });

    // A wrong surname: the armory has no such character, and armory-get says so.
    const wrong = await host.ok<ArmoryLink>(pip, 'armory-link', {
      characterId: mage.id,
      surname: 'Thornberry',
    });
    expect(wrong).toMatchObject({ slug: 'pipwick-thornberry', status: 'pending' });
    expect(await host.armoryFetch(blizzard.api)).toBe(1);
    const missing = await host.ok<{ link: ArmoryEntry }>(pip, 'armory-get', {
      characterId: mage.id,
    });
    expect(missing.link).toMatchObject({ status: 'not-found', profile: null });

    // Fixing it at once saves the surname but waits out the refresh cooldown (no fetch yet), so
    // switching surnames can't hammer Blizzard; ten minutes later the sweep fetches it.
    await host.ok(pip, 'armory-link', { characterId: mage.id, surname: 'Thornbury' });
    expect(await host.armoryFetch(blizzard.api)).toBe(0);
    host.clock.advance(10 * MINUTE);
    expect(await host.ok(host.system, 'armory-sweep')).toMatchObject({ requested: 1 });

    // The right one: the fetch fills in level, item level, guild, gear, and portrait.
    expect(await host.armoryFetch(blizzard.api)).toBe(1);
    const { link } = await host.ok<{ link: ArmoryEntry }>(aeryn, 'armory-get', {
      characterId: mage.id,
    });
    expect(link).toMatchObject({
      memberId: pip.memberId,
      status: 'found',
      classMismatch: false,
      profile: {
        level: 42,
        className: 'Mage',
        guildName: 'Vintage',
        equippedItemLevel: 39,
      },
      equipment: [{ slot: 'CHEST', name: 'Blue Overalls', quality: 'rare', itemLevel: 40 }],
      avatarUrl: 'https://render.worldofwarcraft.com/us/pipwick-avatar.jpg',
    });
    expect(blizzard.calls.filter((u) => u.includes('oauth')).length).toBe(1);

    // A raider sees the guild's links; a member sees only their own.
    const guild = await host.ok<ArmoryEntry[]>(aeryn, 'armory-list', { allGuild: true });
    expect(guild.map((e) => e.slug)).toEqual(['pipwick-thornbury']);
    expect((await host.run(pip, 'armory-list', { allGuild: true })).error?.code).toBe('FORBIDDEN');

    // Nobody but Pip (or an officer) links or refreshes Pip's character.
    const notTheirs = await host.run(aeryn, 'armory-link', {
      characterId: mage.id,
      surname: 'Thornbury',
    });
    expect(notTheirs.error?.code).toBe('CHARACTER_NOT_FOUND');

    // Refreshing right away is refused with when to try; ten minutes later it fetches again.
    const soon = await host.run(pip, 'armory-refresh', { characterId: mage.id });
    expect(soon.error).toMatchObject({ code: 'ARMORY_REFRESH_TOO_SOON', retryable: true });
    host.clock.advance(10 * MINUTE);
    await host.ok(pip, 'armory-refresh', { characterId: mage.id });
    expect(await host.armoryFetch(blizzard.api)).toBe(1);

    // An officer unlinks it after a preview; the character itself stays registered.
    const preview = await host.preview<{ willUnlink: ArmoryLink }>(ana, 'armory-unlink', {
      characterId: mage.id,
    });
    expect(preview.willUnlink.slug).toBe('pipwick-thornbury');
    await host.ok(ana, 'armory-unlink', { characterId: mage.id });
    const after = await host.ok<{ link: ArmoryEntry | null }>(pip, 'armory-get', {
      characterId: mage.id,
    });
    expect(after.link).toBeNull();
    const chars = await host.ok<Character[]>(pip, 'character-list');
    expect(chars.map((c) => c.name)).toEqual(['Pipwick']);
  });

  it('J49 · the twice-daily sweep refreshes what nobody asked for, and Pip never needs to', async () => {
    const { host, pip } = g;
    const blizzard = fakeBlizzard();
    const mage = await host.ok<Character>(pip, 'character-add', {
      name: 'Pipwick',
      class: 'mage',
      spec: 'frost',
    });
    await host.ok(pip, 'armory-link', { characterId: mage.id, surname: 'Thornbury' });
    await host.armoryFetch(blizzard.api);

    // An hour later nothing is stale; twelve hours later the sweep asks again.
    host.clock.advance(60 * MINUTE);
    expect(await host.ok(host.system, 'armory-sweep')).toMatchObject({ requested: 0 });
    host.clock.advance(12 * 60 * MINUTE);
    expect(await host.ok(host.system, 'armory-sweep')).toMatchObject({ requested: 1 });
    await host.armoryFetch(blizzard.api);
    const { link } = await host.ok<{ link: ArmoryEntry }>(pip, 'armory-get', {
      characterId: mage.id,
    });
    expect(link.checkedAt).toBe(host.clock.now());

    // Removing the character drops its link at the next sweep.
    await host.ok(pip, 'character-remove', { characterId: mage.id });
    expect(await host.ok(host.system, 'armory-sweep')).toMatchObject({ removed: 1 });
  });
});
