// Seed the fixture host through commands only: members arrive by `member-sync` (as Discord
// would), add their characters themselves, a leader creates the raids, people answer, an
// officer points the coordinator at a channel and runs a tick, and a raid leader opens a poll.
import type { Member } from '@vintage/identity/contract';
import type { Poll } from '@vintage/polls/contract';
import { CHANNELS, type FixtureMember, MEMBERS, MORE_POLLS, POLL, RAIDS, ROLE_IDS } from './data';
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
  const memberNamed = (name: string) => {
    const member = members.get(name);
    if (!member) throw new Error(`fixture seed: no member ${name}`);
    return member;
  };

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

  const leader = memberNamed('Stridulent');
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

  // The coordinator: an officer sets the channels, a leader runs a tick. The posts land in
  // the host's fake Discord; the actions it logs are what the home page's feed shows.
  await must(
    host.run(host.system, 'coordinator-config-set', {
      signupChannelId: CHANNELS.signups,
      opsChannelId: CHANNELS.ops,
    }),
  );
  await must(host.run(host.callerFor(leader), 'coordinator-run'));

  // A poll for raiders and up, with most of them already voting.
  const poll = await must<Poll>(
    host.run(host.callerFor(memberNamed(POLL.createdBy)), 'poll-create', {
      question: POLL.question,
      description: POLL.description,
      options: [...POLL.options],
      eligibleTier: 'raider',
      closesAt: POLL.closesAt,
      tags: ['off-night'],
    }),
  );
  for (const [name, choice] of POLL.votes) {
    const option = poll.options[choice];
    if (!option) continue;
    await must(
      host.run(host.callerFor(memberNamed(name)), 'vote-cast', {
        pollId: poll.id,
        choices: [option.id],
      }),
    );
  }

  await seedMorePolls(host, memberNamed);
}

/** The other polls: a closed result, an officers-only vote, and an open ranked poll. */
async function seedMorePolls(
  host: FixtureHost,
  memberNamed: (name: string) => Member,
): Promise<void> {
  for (const extra of MORE_POLLS) {
    const creator = host.callerFor(memberNamed(extra.createdBy));
    const made = await must<Poll>(
      host.run(creator, 'poll-create', {
        question: extra.question,
        options: [...extra.options],
        method: extra.method,
        eligibleTier: extra.eligibleTier,
        anonymous: extra.anonymous ?? false,
        resultsVisible: extra.resultsVisible ?? 'live',
        closesAt: POLL.closesAt,
      }),
    );
    for (const [name, picks] of extra.votes) {
      const choices = picks.map((i) => made.options[i]?.id).filter((id): id is string => !!id);
      await must(
        host.run(host.callerFor(memberNamed(name)), 'vote-cast', { pollId: made.id, choices }),
      );
    }
    if (extra.closed) await must(host.run(creator, 'poll-close', { pollId: made.id }));
  }
}
