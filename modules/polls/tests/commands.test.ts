import type { Caller } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import {
  fixedClock,
  makeCaller,
  previewAndConfirm,
  TEST_GUILD_ID,
  testRegistry,
} from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { pollsCommands } from '../src/commands';
import type { Poll } from '../src/contract';
import type { PollsDeps } from '../src/store';
import { createMemoryPollsDeps } from '../src/testing';

const HOUR = 60 * 60 * 1000;

const member = (id: string, displayName: string): Member => ({
  id,
  guildId: TEST_GUILD_ID,
  discordId: `d-${id}`,
  displayName,
  roleIds: [],
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});

const raider = makeCaller('raider');
const raider2 = makeCaller('raider', { memberId: 'member-raider-2' });
const recruit = makeCaller('recruit');
const leader = makeCaller('leader');
const officer = makeCaller('officer');

let clock: ReturnType<typeof fixedClock>;
let deps: ReturnType<typeof createMemoryPollsDeps>;
let registry: ReturnType<typeof testRegistry<PollsDeps>>;

beforeEach(() => {
  clock = fixedClock();
  deps = createMemoryPollsDeps([
    member('member-raider', 'Aeryn'),
    member('member-raider-2', 'Kol'),
  ]);
  registry = testRegistry<PollsDeps>([...pollsCommands], clock);
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, deps);

async function create(input: Record<string, unknown> = {}, caller: Caller = raider) {
  const result = await run(
    'poll-create',
    { question: 'Which night?', options: ['Tuesday', 'Thursday', 'Friday'], ...input },
    caller,
  );
  if (!result.success) throw new Error(`poll-create failed: ${result.error?.code}`);
  return result.data as Poll;
}

const code = (result: Awaited<ReturnType<typeof run>>) =>
  result.success ? 'OK' : result.error?.code;

describe('poll-create', () => {
  it('opens a raider poll at once with generated option ids and announces it', async () => {
    const poll = await create({ tags: ['Raid-Night'] });
    expect(poll).toMatchObject({
      status: 'open',
      eligibleTier: 'raider',
      createdBy: 'member-raider',
      tags: ['raid-night'],
    });
    expect(poll.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(deps.pollEvents.emitted).toEqual([
      expect.objectContaining({
        type: 'poll-opened',
        payload: expect.objectContaining({ pollId: poll.id }),
      }),
    ]);
  });

  it('is hidden from recruits and public callers', async () => {
    expect(code(await run('poll-create', { question: 'q', options: ['a', 'b'] }, recruit))).toBe(
      'COMMAND_NOT_FOUND',
    );
    expect(
      code(await run('poll-create', { question: 'q', options: ['a', 'b'] }, makeCaller('public'))),
    ).toBe('COMMAND_NOT_FOUND');
  });

  it('needs a raid leader to reach members or recruits', async () => {
    const input = { question: 'Guild picnic?', options: ['Yes', 'No'], eligibleTier: 'member' };
    expect(code(await run('poll-create', input, raider))).toBe('FORBIDDEN');
    expect(code(await run('poll-create', input, leader))).toBe('OK');
  });

  it('refuses a tier above the creator and public voters', async () => {
    const officers = { question: 'Promote Kol?', options: ['Yes', 'No'], eligibleTier: 'officer' };
    expect(code(await run('poll-create', officers, leader))).toBe('TIER_TOO_HIGH');
    expect(code(await run('poll-create', officers, officer))).toBe('OK');
    expect(code(await run('poll-create', { ...officers, eligibleTier: 'public' }, officer))).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('rejects duplicate labels, one option, a past close time, and maxChoices off multi', async () => {
    const base = { question: 'q' };
    expect(code(await run('poll-create', { ...base, options: ['A', 'a'] }, raider))).toBe(
      'VALIDATION_ERROR',
    );
    expect(code(await run('poll-create', { ...base, options: ['A'] }, raider))).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      code(
        await run(
          'poll-create',
          { ...base, options: ['A', 'B'], closesAt: clock.now() - 1 },
          raider,
        ),
      ),
    ).toBe('INVALID_TIME');
    expect(
      code(await run('poll-create', { ...base, options: ['A', 'B'], maxChoices: 1 }, raider)),
    ).toBe('INVALID_CHOICES');
  });

  it('saves a draft when opensAt is later, without announcing it', async () => {
    const poll = await create({ opensAt: clock.now() + HOUR });
    expect(poll.status).toBe('draft');
    expect(deps.pollEvents.emitted).toEqual([]);
  });
});

describe('vote-cast and vote-retract', () => {
  it('records one ballot per member and replaces it on change', async () => {
    const poll = await create();
    expect(code(await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider))).toBe('OK');
    const changed = await run('vote-cast', { pollId: poll.id, choices: ['o2'] }, raider);
    expect(changed).toMatchObject({ success: true, data: { labels: ['Thursday'] } });
    expect(await deps.polls.countVotes(TEST_GUILD_ID, poll.id)).toBe(1);
    const votes = deps.pollEvents.emitted.filter((e) => e.type === 'vote-cast');
    expect(votes.map((e) => e.payload)).toEqual([
      { pollId: poll.id, memberId: 'member-raider', from: null, to: ['o1'] },
      { pollId: poll.id, memberId: 'member-raider', from: ['o1'], to: ['o2'] },
    ]);
  });

  it('does not announce a repeat of the same vote', async () => {
    const poll = await create();
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    expect(deps.pollEvents.emitted.filter((e) => e.type === 'vote-cast')).toHaveLength(1);
  });

  it('treats a poll above your tier as missing', async () => {
    const poll = await create();
    expect(code(await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, recruit))).toBe(
      'POLL_NOT_FOUND',
    );
  });

  it('checks the ballot against the method and options', async () => {
    const single = await create();
    expect(code(await run('vote-cast', { pollId: single.id, choices: ['o1', 'o2'] }, raider))).toBe(
      'INVALID_CHOICES',
    );
    expect(code(await run('vote-cast', { pollId: single.id, choices: ['o9'] }, raider))).toBe(
      'INVALID_CHOICES',
    );
    const multi = await create({ method: 'multi', maxChoices: 2 });
    expect(
      code(await run('vote-cast', { pollId: multi.id, choices: ['o1', 'o2', 'o3'] }, raider)),
    ).toBe('INVALID_CHOICES');
    expect(code(await run('vote-cast', { pollId: multi.id, choices: ['o1', 'o1'] }, raider))).toBe(
      'INVALID_CHOICES',
    );
    expect(code(await run('vote-cast', { pollId: multi.id, choices: ['o3', 'o1'] }, raider))).toBe(
      'OK',
    );
  });

  it('refuses votes after the close time even before the sweep runs', async () => {
    const poll = await create({ closesAt: clock.now() + HOUR });
    clock.advance(HOUR);
    expect(code(await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider))).toBe(
      'POLL_CLOSED',
    );
  });

  it('never names the voter of an anonymous poll on the bus', async () => {
    const poll = await create({ anonymous: true });
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    await run('vote-retract', { pollId: poll.id }, raider);
    const payloads = deps.pollEvents.emitted
      .filter((e) => e.type === 'vote-cast')
      .map((e) => e.payload);
    expect(payloads).toEqual([
      { pollId: poll.id, memberId: null, from: null, to: ['o1'] },
      { pollId: poll.id, memberId: null, from: ['o1'], to: null },
    ]);
  });

  it('retracts a vote and is a no-op without one', async () => {
    const poll = await create();
    expect(await run('vote-retract', { pollId: poll.id }, raider)).toMatchObject({
      data: { retracted: false },
    });
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    expect(await run('vote-retract', { pollId: poll.id }, raider)).toMatchObject({
      data: { retracted: true },
    });
    expect(await deps.polls.countVotes(TEST_GUILD_ID, poll.id)).toBe(0);
  });
});

describe('poll-update', () => {
  it('lets the creator or a leader edit, and bumps the config version', async () => {
    const poll = await create();
    expect(code(await run('poll-update', { pollId: poll.id, question: 'Nope' }, raider2))).toBe(
      'FORBIDDEN',
    );
    const edited = await run(
      'poll-update',
      { pollId: poll.id, question: 'Which raid night?' },
      leader,
    );
    expect(edited).toMatchObject({
      success: true,
      data: { question: 'Which raid night?', configVersion: 2 },
    });
  });

  it('locks options once anyone has voted', async () => {
    const poll = await create();
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider2);
    expect(
      code(await run('poll-update', { pollId: poll.id, options: ['Mon', 'Wed'] }, raider)),
    ).toBe('OPTIONS_LOCKED');
    expect(code(await run('poll-update', { pollId: poll.id, quorum: 5 }, raider))).toBe('OK');
  });
});

describe('poll-close and poll-cancel', () => {
  it('previews the result, then closes, freezes it, and announces it', async () => {
    const poll = await create({ tags: ['raid-night'] });
    await run('vote-cast', { pollId: poll.id, choices: ['o2'] }, raider);
    await run('vote-cast', { pollId: poll.id, choices: ['o2'] }, raider2);

    const { preview, result } = await previewAndConfirm(
      registry,
      { name: 'poll-close', input: { pollId: poll.id }, caller: raider },
      deps,
    );
    expect(preview).toMatchObject({
      success: true,
      data: { preview: { results: { winners: ['o2'], ballots: 2 } } },
    });
    expect(result.success).toBe(true);
    const closed = deps.polls.polls.get(poll.id);
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'member-raider' });
    expect(closed?.results?.winners).toEqual(['o2']);
    expect(deps.pollEvents.emitted.at(-1)).toMatchObject({
      type: 'poll-closed',
      payload: { pollId: poll.id, tags: ['raid-night'] },
    });
  });

  it('does not show a hidden tally in the close preview or after closing', async () => {
    const hidden = await create({ resultsVisible: 'after-close' });
    await run('vote-cast', { pollId: hidden.id, choices: ['o1'] }, raider2);
    const peek = await run('poll-close', { pollId: hidden.id }, raider);
    expect(peek).toMatchObject({ success: true, data: { preview: { ballots: 1, results: null } } });
    expect(await run('poll-close', { pollId: hidden.id }, officer)).toMatchObject({
      data: { preview: { results: { winners: ['o1'] } } },
    });

    const secret = await create({ resultsVisible: 'officers' });
    await run('vote-cast', { pollId: secret.id, choices: ['o2'] }, raider2);
    const { result } = await previewAndConfirm(
      registry,
      { name: 'poll-close', input: { pollId: secret.id }, caller: raider },
      deps,
    );
    expect(result).toMatchObject({
      success: true,
      data: { results: null, poll: { status: 'closed', results: null } },
    });
    expect(deps.polls.polls.get(secret.id)?.results?.winners).toEqual(['o2']);
  });

  it('changes nothing on the preview alone', async () => {
    const poll = await create();
    await run('poll-close', { pollId: poll.id }, raider);
    expect(deps.polls.polls.get(poll.id)?.status).toBe('open');
  });

  it('keeps closing to the creator or a leader', async () => {
    const poll = await create();
    expect(code(await run('poll-close', { pollId: poll.id }, raider2))).toBe('FORBIDDEN');
  });

  it('lets only leaders cancel, with no result', async () => {
    const poll = await create();
    expect(code(await run('poll-cancel', { pollId: poll.id }, raider))).toBe('COMMAND_NOT_FOUND');
    const { result } = await previewAndConfirm(
      registry,
      { name: 'poll-cancel', input: { pollId: poll.id }, caller: leader },
      deps,
    );
    expect(result.success).toBe(true);
    expect(deps.polls.polls.get(poll.id)).toMatchObject({ status: 'cancelled', results: null });
    expect(code(await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider))).toBe(
      'POLL_CLOSED',
    );
  });
});

describe('results visibility', () => {
  it('shows live results and names voters on a public poll', async () => {
    const poll = await create();
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    const result = await run('poll-results', { pollId: poll.id }, raider2);
    expect(result).toMatchObject({
      success: true,
      data: { voters: [{ memberId: 'member-raider', displayName: 'Aeryn', choices: ['o1'] }] },
    });
  });

  it('hides an after-close tally until it closes, except from officers', async () => {
    const poll = await create({ resultsVisible: 'after-close', closesAt: clock.now() + HOUR });
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    expect(code(await run('poll-results', { pollId: poll.id }, raider))).toBe('RESULTS_HIDDEN');
    expect(code(await run('poll-results', { pollId: poll.id }, officer))).toBe('OK');
    const got = await run('poll-get', { pollId: poll.id }, raider);
    expect(got).toMatchObject({
      data: { poll: { results: null, resultsHidden: true }, myVote: ['o1'], ballots: 1 },
    });

    clock.advance(HOUR);
    await run('poll-sweep', {}, leader);
    expect(code(await run('poll-results', { pollId: poll.id }, raider))).toBe('OK');
  });

  it('keeps an officers-only tally from everyone else, even after close', async () => {
    const poll = await create({ resultsVisible: 'officers' }, officer);
    await previewAndConfirm(
      registry,
      { name: 'poll-close', input: { pollId: poll.id }, caller: officer },
      deps,
    );
    expect(code(await run('poll-results', { pollId: poll.id }, raider))).toBe('RESULTS_HIDDEN');
  });

  it('never lists the voters of an anonymous poll, even to officers', async () => {
    const poll = await create({ anonymous: true });
    await run('vote-cast', { pollId: poll.id, choices: ['o1'] }, raider);
    expect(await run('poll-results', { pollId: poll.id }, officer)).toMatchObject({
      success: true,
      data: { voters: null, results: { ballots: 1 } },
    });
  });
});

describe('poll-list and poll-get', () => {
  it('lists only polls the caller may vote on', async () => {
    const raiders = await create();
    const members = await create({ eligibleTier: 'member' }, leader);
    const list = async (caller: Caller) => {
      const result = await run('poll-list', {}, caller);
      return result.success ? (result.data as Poll[]).map((p) => p.id) : [];
    };
    expect(await list(recruit)).toEqual([members.id]);
    expect((await list(raider)).sort()).toEqual([raiders.id, members.id].sort());
  });
});

describe('poll-sweep', () => {
  it('opens due drafts, closes due polls, and is safe to repeat', async () => {
    const draft = await create({ opensAt: clock.now() + HOUR, closesAt: clock.now() + 3 * HOUR });
    const open = await create({ closesAt: clock.now() + 2 * HOUR });

    clock.advance(HOUR);
    expect(await run('poll-sweep', {}, leader)).toMatchObject({
      data: { opened: [draft.id], closed: [] },
    });
    clock.advance(HOUR);
    expect(await run('poll-sweep', {}, leader)).toMatchObject({
      data: { opened: [], closed: [open.id] },
    });
    const emitted = deps.pollEvents.emitted.length;
    expect(await run('poll-sweep', {}, leader)).toMatchObject({ data: { opened: [], closed: [] } });
    expect(deps.pollEvents.emitted).toHaveLength(emitted);
    expect(deps.polls.polls.get(open.id)?.closedBy).toBeNull();
  });
});
