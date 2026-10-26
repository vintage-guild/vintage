// Seed the fixture host through commands only: members arrive by `member-sync` (as Discord
// would), add their characters themselves, a leader creates the raids, and people answer.
import type { Member } from '@vintage/identity/contract';
import { type FixtureMember, MEMBERS, RAIDS, ROLE_IDS } from './data';
import type { FixtureHost } from './host';

const discordIdOf = (m: FixtureMember) =>
  `2${String([...m.name].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)).padStart(16, '0')}`;

async function must<T>(promise: Promise<{ success: boolean; data?: T; error?: unknown }>) {
  const result = await promise;
  if (!result.success) throw new Error(`fixture seed failed: ${JSON.stringify(result.error)}`);
  return result.data as T;
}

export async function seedFixtures(host: FixtureHost): Promise<void> {
  const members = new Map<string, Member>();
  const characters = new Map<string, string>();

  for (const m of MEMBERS) {
    await must(
      host.run(host.system, 'member-sync', {
        discordId: discordIdOf(m),
        displayName: m.name,
        inServer: true,
        roleIds: [ROLE_IDS[m.rank]],
      }),
    );
    const member = await host.member(m.name);
    if (!member) throw new Error(`fixture seed: ${m.name} did not sync`);
    members.set(m.name, member);
    const character = await must<{ id: string }>(
      host.run(host.callerFor(member), 'character-add', {
        name: m.character ?? m.name,
        class: m.class,
        spec: m.spec,
        isMain: true,
      }),
    );
    characters.set(m.name, character.id);
  }

  const leader = members.get('Stridulent');
  if (!leader) throw new Error('fixture seed: no leader');
  for (const raid of RAIDS) {
    const event = await must<{ id: string }>(
      host.run(host.callerFor(leader), 'raid-create', {
        name: raid.name,
        instance: raid.instance,
        size: raid.size,
        startsAt: raid.startsAt,
      }),
    );
    const answers = [
      ...raid.going.map((name) => [name, 'accepted'] as const),
      ...raid.tentative.map((name) => [name, 'tentative'] as const),
    ];
    for (const [name, status] of answers) {
      const member = members.get(name);
      const characterId = characters.get(name);
      if (!member || !characterId) continue;
      await must(
        host.run(host.callerFor(member), 'signup-set', {
          eventId: event.id,
          characterId,
          status,
        }),
      );
    }
  }
}
