// JTBD: polls (docs/jtbd/polls.md). A raider asks the raid a question in Discord and everyone
// answers from the post. Driven only through the Discord flow and commands.

import { messageText } from '@vintage/coordinator/testing';
import { type Caller, publicCaller } from '@vintage/guild-kit';
import type { Poll, PollResults } from '@vintage/polls/contract';
import type { RaidEvent } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHost,
  GUILD,
  HOUR,
  type Host,
  LEADS_CHANNEL,
  OPS_CHANNEL,
  POLL_CHANNEL,
  ROLES,
  SIGNUP_CHANNEL,
} from './host';

// These tests cover the poll surfaces, so they run with Polls on; help-polls-off.test.ts covers
// the flag being off.
vi.mock('@vintage/features', () => ({ FEATURES: { polls: true }, featureOn: () => true }));

interface Guild {
  host: Host;
  rook: Caller; // raid leader
  aeryn: Caller; // raider
  bram: Caller; // raider
  pip: Caller; // member
}

async function createGuild(): Promise<Guild> {
  const host = createHost();
  const join = (id: string, name: string, role: string) =>
    host.discordMember(`50000000000000000${id}`, name, [role]);
  return {
    host,
    rook: await join('2', 'Rook', ROLES.raidLeader),
    aeryn: await join('3', 'Aeryn', ROLES.raider),
    bram: await join('4', 'Bram', ROLES.raider),
    pip: await join('7', 'Pip', ROLES.member),
  };
}

const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
const flags = (r: unknown) => (r as { data?: { flags?: number } }).data?.flags;
const EPHEMERAL = 64;

describe('JTBD: polls', () => {
  let g: Guild;
  let ui: Host['pollUi'];
  beforeEach(async () => {
    g = await createGuild();
    ui = g.host.pollUi;
  });

  /** Aeryn's poll, found the way a member would: the open polls she may vote on. */
  async function aerynsPoll(options: Record<string, string | number | boolean> = {}) {
    const created = await ui.create(g.aeryn.discordId!, {
      question: 'Which night for the Onyxia run?',
      options: 'Tuesday; Thursday',
      ...options,
    });
    const [poll] = await g.host.ok<Poll[]>(g.aeryn, 'poll-list');
    if (!poll) throw new Error('no open poll');
    return { created, poll };
  }

  it('J17 · a raider asks the raid a question and sees the answer on the post', async () => {
    // Create: a private reply, and the post goes up in this channel with a button per option.
    const { created, poll } = await aerynsPoll();
    expect(flags(created)).toBe(EPHEMERAL);
    expect(content(created)).toMatch(/going up in this channel/);
    expect(ui.pollPosts.get(poll.id)?.channelId).toBe(POLL_CHANNEL);
    expect(ui.postText(poll.id)).toContain('## Which night for the Onyxia run?');
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).toContain(`poll:v:${poll.id}:o1`);

    // Vote: a private answer, the post's counts move, and changing a vote never makes two.
    const voted = await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    expect(flags(voted)).toBe(EPHEMERAL);
    expect(content(voted)).toMatch(/You voted for \*\*Tuesday\*\*/);
    await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o2`);
    await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
    expect(ui.postText(poll.id)).toMatch(/\*\*Thursday\*\*\n`█+` 2 · 100%/);
    expect(ui.postText(poll.id)).toContain('2 of 3 voted');

    // A Member is below the poll's audience: a private "no such poll", and nothing moves.
    const refused = await ui.click(g.pip.discordId!, `poll:v:${poll.id}:o1`);
    expect(content(refused)).toMatch(/No such poll/);
    expect(ui.postText(poll.id)).toContain('2 of 3 voted');

    // Someone who didn't create it and doesn't lead raids can't close it.
    const notTheirs = await ui.click(g.bram.discordId!, `poll:c:${poll.id}`);
    expect(content(notTheirs)).toMatch(/Only the poll creator or a raid leader/);

    // Close: a private preview first, then the confirm marks the winner and drops the buttons.
    const preview = await ui.click(g.aeryn.discordId!, `poll:c:${poll.id}`);
    expect(content(preview)).toMatch(/Thursday wins with 2 ballots/);
    expect(JSON.stringify(preview)).toContain(`poll:cc:${poll.id}`);
    expect(ui.postText(poll.id)).not.toContain('**closed**');
    await ui.click(g.aeryn.discordId!, `poll:cc:${poll.id}`);
    expect(ui.postText(poll.id)).toContain('**Thursday** ✓');
    expect(ui.postText(poll.id)).toContain('**closed**');
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).not.toContain('poll:v:');

    // A late click is refused.
    const late = await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    expect(content(late)).toMatch(/not taking votes/);
  });

  it('J17 · a hidden, anonymous poll shows how many voted but no counts or names', async () => {
    const { poll } = await aerynsPoll({ anonymous: true, results: 'after-close' });
    await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    const text = ui.postText(poll.id) ?? '';
    expect(text).toContain('1 of 3 voted');
    expect(text).toContain('results show at close');
    expect(text).not.toContain('█');
    expect(text).not.toContain('Bram');
  });

  it('J17 · pick-any polls answer from a menu', async () => {
    const { poll } = await aerynsPoll({ method: 'multi', options: 'Tue; Wed; Thu' });
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).toContain(`poll:s:${poll.id}`);
    await ui.pick(g.bram.discordId!, `poll:s:${poll.id}`, ['o1', 'o3']);
    expect(ui.postText(poll.id)).toMatch(/\*\*Thu\*\*\n`█+` 1 · 100%/);
  });

  it('J22 · members see polls and permitted results; officers see every closed result', async () => {
    const ana = await g.host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    type Row = Poll & { results: PollResults | null; resultsHidden: boolean };
    const list = (who: Caller, statuses = ['open']) =>
      g.host.ok<Row[]>(who, 'poll-list', { statuses });
    const questions = (rows: Row[]) => rows.map((r) => r.question);

    // A raid leader asks the raiders, results when it closes; a ranked poll too (voted on the site).
    const night = await g.host.ok<Poll>(g.rook, 'poll-create', {
      question: 'Which night?',
      options: ['Tuesday', 'Thursday'],
      resultsVisible: 'after-close',
    });
    const ranked = await g.host.ok<Poll>(g.rook, 'poll-create', {
      question: 'Rank the attunements',
      options: ['Onyxia', 'Molten Core', 'Zul’Gurub'],
      method: 'ranked',
    });
    // An officers-only vote, anonymous, its result for officers.
    const promote = await g.host.ok<Poll>(ana, 'poll-create', {
      question: 'Promote Bram?',
      options: ['Yes', 'Not yet'],
      eligibleTier: 'officer',
      anonymous: true,
      resultsVisible: 'officers',
    });

    // The raider's /polls: the two raider polls, never the officers' vote.
    expect(questions(await list(g.aeryn))).toEqual(['Which night?', 'Rank the attunements']);
    expect(questions(await list(g.rook))).not.toContain('Promote Bram?');

    // Voting on the site is the same ballot; a ranked ballot keeps its order.
    await g.host.ok(g.aeryn, 'vote-cast', { pollId: night.id, choices: ['o2'] });
    await g.host.ok(g.bram, 'vote-cast', { pollId: ranked.id, choices: ['o2', 'o1'] });
    expect(
      (await g.host.ok<{ myVote: string[] }>(g.bram, 'poll-get', { pollId: ranked.id })).myVote,
    ).toEqual(['o2', 'o1']);

    // Results when it closes: no tally for the raider while open.
    const open = await g.host.ok<{ poll: Row }>(g.aeryn, 'poll-get', { pollId: night.id });
    expect(open.poll).toMatchObject({ resultsHidden: true, results: null });

    // Close both (preview, then confirm).
    await g.host.ok(ana, 'vote-cast', { pollId: promote.id, choices: ['o1'] });
    await g.host.run(g.rook, 'poll-close', { pollId: night.id });
    await g.host.run(ana, 'poll-close', { pollId: promote.id });

    // After close, the raider sees the night's result; the officer sees every closed result.
    const raiderClosed = await list(g.aeryn, ['closed']);
    expect(questions(raiderClosed)).toEqual(['Which night?']);
    expect(raiderClosed[0]?.results?.winners).toEqual(['o2']);
    const officerClosed = await list(ana, ['closed']);
    expect(questions(officerClosed).sort()).toEqual(['Promote Bram?', 'Which night?']);
    expect(officerClosed.find((r) => r.question === 'Promote Bram?')?.results?.winners).toEqual([
      'o1',
    ]);

    // A visitor is refused outright.
    expect(await g.host.run(publicCaller(GUILD), 'poll-list')).toMatchObject({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND' },
    });
  });

  it('J43 · a raider votes from the home page and the poll page, ranked polls too', async () => {
    type Got = { poll: Poll & { results: PollResults | null }; myVote: string[] | null };
    const get = (who: Caller, pollId: string) => g.host.ok<Got>(who, 'poll-get', { pollId });
    const votes = (got: Got) => got.poll.results?.options.map((o) => o.votes);

    // An off-night poll from Discord, and a ranked one Discord can only link to the site for.
    const { poll: night } = await aerynsPoll();
    const ranked = await g.host.ok<Poll>(g.rook, 'poll-create', {
      question: 'Which raid first?',
      options: ['Onyxia', 'Molten Core', 'Zul’Gurub'],
      method: 'ranked',
    });
    expect(JSON.stringify(ui.pollPosts.get(night.id)?.message)).toContain('poll:v:');

    // The home page's card: the first open poll (`poll-list`), its tally and my ballot (`poll-get`).
    const [first] = await g.host.ok<Poll[]>(g.aeryn, 'poll-list');
    expect(first?.id).toBe(night.id);
    expect(await get(g.aeryn, night.id)).toMatchObject({ myVote: null });

    // A click on the card is `vote-cast`, the same ballot as the post's buttons: Bram's Discord
    // vote shows as his on the site, and the post counts Aeryn's site vote.
    await g.host.ok(g.aeryn, 'vote-cast', { pollId: night.id, choices: ['o2'] });
    await ui.click(g.bram.discordId!, `poll:v:${night.id}:o1`);
    expect((await get(g.bram, night.id)).myVote).toEqual(['o1']);
    expect(ui.postText(night.id)).toContain('2 of 3 voted');

    // Changing the vote on the site replaces it; "Take back my vote" is `vote-retract`.
    await g.host.ok(g.bram, 'vote-cast', { pollId: night.id, choices: ['o2'] });
    expect(votes(await get(g.aeryn, night.id))).toEqual([0, 2]);
    await g.host.ok(g.bram, 'vote-retract', { pollId: night.id });
    expect(votes(await get(g.aeryn, night.id))).toEqual([0, 1]);
    expect((await get(g.bram, night.id)).myVote).toBeNull();

    // A Member is below the audience: no card on the home page, and a vote is refused.
    expect(await g.host.ok<Poll[]>(g.pip, 'poll-list')).toEqual([]);
    expect(
      await g.host.run(g.pip, 'vote-cast', { pollId: night.id, choices: ['o1'] }),
    ).toMatchObject({ success: false });

    // /polls/<id> for the ranked poll: each raider ranks in order, and the order is kept.
    const join = (id: string, name: string) =>
      g.host.discordMember(`50000000000000000${id}`, name, [ROLES.raider]);
    const cato = await join('5', 'Cato');
    const dara = await join('6', 'Dara');
    const rank = (who: Caller, choices: string[]) =>
      g.host.ok(who, 'vote-cast', { pollId: ranked.id, choices });
    await rank(g.aeryn, ['o1']);
    await rank(g.bram, ['o1']);
    await rank(g.rook, ['o2', 'o3']);
    await rank(cato, ['o2', 'o3']);
    await rank(dara, ['o3', 'o2']);
    expect((await get(dara, ranked.id)).myVote).toEqual(['o3', 'o2']);
    // Open, the card shows first preferences.
    expect(votes(await get(g.aeryn, ranked.id))).toEqual([2, 2, 1]);

    // Closed, the runoff decides: Zul’Gurub goes out and Dara's second choice carries Molten Core.
    await g.host.run(g.rook, 'poll-close', { pollId: ranked.id });
    const closed = await get(g.aeryn, ranked.id);
    expect(closed.poll.status).toBe('closed');
    expect(closed.poll.results?.winners).toEqual(['o2']);
    expect(closed.poll.results?.rounds).toHaveLength(2);
    expect(
      await g.host.run(g.aeryn, 'vote-cast', { pollId: ranked.id, choices: ['o1'] }),
    ).toMatchObject({ success: false });
  });

  describe('J18 · pick the raid night by vote', () => {
    /** Tue 3 Nov and Thu 5 Nov 2026, 20:00 Chicago (CST). */
    const TUE = Date.UTC(2026, 10, 4, 2);
    const THU = Date.UTC(2026, 10, 6, 2);

    async function askWhichNight() {
      await g.host.configureCoordinator();
      const { poll } = await g.host.ok<{ poll: Poll }>(g.rook, 'raid-night-poll', {
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startTimes: [TUE, THU],
        closesAt: g.host.clock.now() + 48 * HOUR,
      });
      return poll;
    }

    async function closeAndTick() {
      g.host.clock.advance(49 * HOUR);
      await g.host.ok(g.host.system, 'poll-sweep');
      await g.host.tick();
    }

    const raids = async () =>
      (await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list')).map((r) => r.event);

    it('J18 · a raid leader asks which night works, and the winner becomes the raid', async () => {
      // The poll goes up in the signup channel with the two times, labelled in Chicago time.
      const poll = await askWhichNight();
      expect(ui.pollPosts.get(poll.id)?.channelId).toBe(SIGNUP_CHANNEL);
      expect(ui.postText(poll.id)).toContain('Thu 5 Nov, 8:00 PM CST');
      expect(ui.postText(poll.id)).toContain(`<t:${THU / 1000}:F>`);

      // Raiders vote from the post; Thursday wins two to one.
      await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o2`);
      await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
      await ui.click(g.rook.discordId!, `poll:v:${poll.id}:o1`);
      expect(await raids()).toEqual([]);

      // The poll closes, and the next tick makes the raid and posts its signup message.
      await closeAndTick();
      const [raid] = await raids();
      expect(raid).toMatchObject({
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startsAt: THU,
      });
      expect(
        g.host.sentTo(SIGNUP_CHANNEL).some((m) => messageText(m.message).includes('Onyxia')),
      ).toBe(true);

      // Ticking again never makes a second raid.
      await g.host.tick();
      expect(await raids()).toHaveLength(1);
    });

    it('J18 · a tie goes to the officers instead of a guess', async () => {
      const poll = await askWhichNight();
      await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o1`);
      await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
      await closeAndTick();
      expect(await raids()).toEqual([]);
      const [note] = g.host.sentTo(OPS_CHANNEL);
      expect(messageText(note!.message)).toContain('closed without a raid for **Onyxia**: it tied');
    });

    it('J18 · only raid leaders can start one', async () => {
      await g.host.configureCoordinator();
      const tried = await g.host.run(g.aeryn, 'raid-night-poll', {
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startTimes: [TUE, THU],
        closesAt: g.host.clock.now() + 48 * HOUR,
      });
      expect(tried).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
    });
  });

  it('J71 · leader and officer polls stay out of public channels and post only in configured ones', async () => {
    const ana = await g.host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);

    // Before officer/leads channels are configured, Discord creation for officer polls is refused.
    const unconfigured = await ui.create(
      ana.discordId!,
      { question: 'Promote Bram?', options: 'Yes; Not yet', audience: 'officer' },
      POLL_CHANNEL,
    );
    expect(flags(unconfigured)).toBe(EPHEMERAL);
    expect(content(unconfigured)).toContain('coordinator-config-set');
    expect(ui.pollPosts.size).toBe(0);

    // Web-only creation (no channelId) still works because every command hides officer polls by tier.
    const webOnly = await g.host.ok<Poll>(ana, 'poll-create', {
      question: 'Policy draft?',
      options: ['Approve', 'Revise'],
      eligibleTier: 'officer',
    });
    expect(webOnly.eligibleTier).toBe('officer');

    // Configure both the officer and leads channels.
    await g.host.configureCoordinator({ leadsChannelId: LEADS_CHANNEL });

    // Officer poll in a public channel or in #leads is refused privately; nothing is posted.
    const officerPublic = await ui.create(
      ana.discordId!,
      { question: 'Promote Bram?', options: 'Yes; Not yet', audience: 'officer' },
      POLL_CHANNEL,
    );
    expect(flags(officerPublic)).toBe(EPHEMERAL);
    expect(content(officerPublic)).toContain(`<#${OPS_CHANNEL}>`);
    expect(ui.pollPosts.size).toBe(0);

    const officerInLeads = await ui.create(
      ana.discordId!,
      { question: 'Promote Bram?', options: 'Yes; Not yet', audience: 'officer' },
      LEADS_CHANNEL,
    );
    expect(flags(officerInLeads)).toBe(EPHEMERAL);
    expect(content(officerInLeads)).toContain(`<#${OPS_CHANNEL}>`);
    expect(ui.pollPosts.size).toBe(0);

    // Officer poll in #vintage-ops succeeds and posts there.
    const officerOk = await ui.create(
      ana.discordId!,
      { question: 'Promote Bram?', options: 'Yes; Not yet', audience: 'officer' },
      OPS_CHANNEL,
    );
    expect(flags(officerOk)).toBe(EPHEMERAL);
    expect(content(officerOk)).toMatch(/going up in this channel/);
    const [opsPost] = [...ui.pollPosts.values()];
    expect(opsPost?.channelId).toBe(OPS_CHANNEL);

    // Raid-leader poll in a public channel is refused; in #leads or #vintage-ops it succeeds.
    const leaderPublic = await ui.create(
      g.rook.discordId!,
      { question: 'Raid roster order?', options: 'A; B', audience: 'leader' },
      POLL_CHANNEL,
    );
    expect(flags(leaderPublic)).toBe(EPHEMERAL);
    expect(content(leaderPublic)).toContain(`<#${LEADS_CHANNEL}>`);
    expect(content(leaderPublic)).toContain(`<#${OPS_CHANNEL}>`);
    expect(ui.pollPosts.size).toBe(1);

    const leaderInLeads = await ui.create(
      g.rook.discordId!,
      { question: 'Raid roster order?', options: 'A; B', audience: 'leader' },
      LEADS_CHANNEL,
    );
    expect(content(leaderInLeads)).toMatch(/going up in this channel/);
    expect([...ui.pollPosts.values()].some((p) => p.channelId === LEADS_CHANNEL)).toBe(true);

    const leaderInOps = await ui.create(
      ana.discordId!,
      { question: 'Loot split?', options: 'A; B', audience: 'leader' },
      OPS_CHANNEL,
    );
    expect(content(leaderInOps)).toMatch(/going up in this channel/);
    expect(ui.pollPosts.size).toBe(3);

    // A raid-night poll targeting leaders cannot be posted to the public signup channel either.
    const TUE = Date.UTC(2026, 10, 4, 2);
    const THU = Date.UTC(2026, 10, 6, 2);
    const badNight = await g.host.run(g.rook, 'raid-night-poll', {
      name: 'Leads sync',
      instance: 'Onyxia',
      size: 40,
      eligibleTier: 'leader',
      startTimes: [TUE, THU],
      closesAt: g.host.clock.now() + 48 * HOUR,
    });
    expect(badNight).toMatchObject({ success: false, error: { code: 'CHANNEL_NOT_ALLOWED' } });
  });

  it('J81 · post-raid feedback survey, Discord invite, non-responder nudges respecting DM opt-out, and CSV export', async () => {
    const ana = await g.host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    await g.host.configureCoordinator();
    await g.host.ok(g.bram, 'member-prefs-set', { dmOptOut: true });

    // Create a raid in the past hour and complete it. With postRaidFeedbackSurvey off (default),
    // ticking opens no survey.
    const raidStart = g.host.clock.now() + HOUR;
    const raid = await g.host.ok<RaidEvent>(ana, 'raid-create', {
      name: 'Molten Core',
      instance: 'Molten Core',
      size: 40,
      startsAt: raidStart,
    });
    g.host.clock.advance(2 * HOUR);
    await g.host.ok(g.rook, 'raid-complete', { eventId: raid.id });
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    expect(await g.host.ok<unknown[]>(g.aeryn, 'survey-list', {})).toEqual([]);

    // Enable postRaidFeedbackSurvey: the next tick opens an anonymous feedback survey and posts
    // the Discord invite embed with a link button.
    await g.host.ok(ana, 'coordinator-config-set', { postRaidFeedbackSurvey: true });
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const surveys = await g.host.ok<{ id: string; title: string; anonymous: boolean }[]>(
      g.aeryn,
      'survey-list',
      { tag: 'raid-feedback' },
    );
    expect(surveys).toHaveLength(1);
    const survey = surveys[0]!;
    expect(survey.title).toBe('Feedback: Molten Core');
    expect(survey.anonymous).toBe(true);

    const invite = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => m.message.embeds?.[0]?.title === 'Feedback: Molten Core');
    expect(invite?.message.embeds?.[0]?.description).toContain('**0 / 4** responded');
    expect(JSON.stringify(invite?.message.components)).toContain(
      `https://vintageguild.gg/surveys/${survey.id}`,
    );

    // Aeryn submits a response on the website.
    await g.host.ok(g.aeryn, 'response-set', {
      surveyId: survey.id,
      answers: [
        { questionId: 'q1', choices: ['o1'] },
        { questionId: 'q2', text: 'Great pulls, keep it up' },
      ],
    });

    // Advance inside the 24h nudge window: non-responders without dmOptOut (Ana, Rook) are DMed;
    // Aeryn (already answered) and Bram (dmOptOut) are NOT DMed.
    g.host.clock.advance(25 * HOUR);
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const dmRecipients = g.host.discord.sent
      .filter((d) => d.kind === 'dm' && d.message.content?.includes('Feedback: Molten Core'))
      .map((d) => d.to);
    expect(dmRecipients).toContain(ana.discordId);
    expect(dmRecipients).toContain(g.rook.discordId);
    expect(dmRecipients).not.toContain(g.aeryn.discordId);
    expect(dmRecipients).not.toContain(g.bram.discordId);

    // Close and export CSV: anonymous omits member identities.
    await g.host.ok(ana, 'survey-close', { surveyId: survey.id });
    const exported = await g.host.ok<{ csv: string; responses: number }>(ana, 'survey-export', {
      surveyId: survey.id,
    });
    expect(exported.responses).toBe(1);
    expect(exported.csv).toContain('Smooth');
    expect(exported.csv).toContain('Great pulls, keep it up');
    expect(exported.csv).not.toContain('Aeryn');
  });
});
