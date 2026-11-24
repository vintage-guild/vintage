// Parity and cross-guild isolation tests for operational Convex store adapters (#260):
// coordinator, polls, applications, agent, insights, armory/roster/catalog, plus read-only guard.
import { createMemoryAgentStore } from '@vintage/agent/testing';
import { createMemoryApplicationsStore } from '@vintage/applications/testing';
import {
  createMemoryArmoryStore,
  createMemoryCatalogStore,
  createMemoryRosterStore,
} from '@vintage/armory/testing';
import { createMemoryCoordinatorStore } from '@vintage/coordinator/testing';
import { createMemoryInsightsStore } from '@vintage/insights/testing';
import { createMemoryPollsStore } from '@vintage/polls/testing';
import { createMemoryWishlistStore } from '@vintage/wishlist/testing';
import { describe, expect, it } from 'vitest';
import {
  agentStore,
  applicationsStore,
  armoryStore,
  catalogStore,
  coordinatorStore,
  insightsStore,
  pollsStore,
  rosterStore,
  siteStore,
  wishlistStore,
} from '../../convex/stores';
import { createConvexBackend, GUILD_A, GUILD_B } from './harness';

function parity<Store>(
  name: string,
  createMemory: () => Store,
  createConvex: (ctx: Parameters<typeof pollsStore>[0]) => Store,
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

parity('coordinatorStore', createMemoryCoordinatorStore, coordinatorStore, (setup) => {
  it('merges config defaults, claims/completes actions, tracks raid nights and announced state per guild', async () => {
    const { run } = await setup();

    await run(async (s) => {
      // Config defaults + isolated updates
      const def = await s.getConfig(GUILD_A);
      expect(def.paused).toBe(false);
      await s.setConfig(GUILD_A, { paused: true, signupChannelId: '111111111111111111' }, 1000);
      expect((await s.getConfig(GUILD_A)).paused).toBe(true);
      expect((await s.getConfig(GUILD_B)).paused).toBe(false);

      // Action claim idempotency + completion + isolation
      const claim1 = await s.claimAction(
        { guildId: GUILD_A, eventId: 'ev1', rule: 'post', target: 'chan1' },
        1000,
        60_000,
      );
      expect(claim1?.retry).toBe(false);
      // Duplicate claim inside staleMs returns null.
      expect(
        await s.claimAction(
          { guildId: GUILD_A, eventId: 'ev1', rule: 'post', target: 'chan1' },
          2000,
          60_000,
        ),
      ).toBeNull();
      // Same key in another guild is independent.
      const claimB = await s.claimAction(
        { guildId: GUILD_B, eventId: 'ev1', rule: 'post', target: 'chan1' },
        2000,
        60_000,
      );
      expect(claimB?.retry).toBe(false);

      // Cross-guild complete / setRenderHash must not touch GUILD_A's action.
      await expect(
        s.completeAction(GUILD_B, claim1!.action.id, { status: 'sent' }, 3000),
      ).rejects.toThrow();
      const done = await s.completeAction(
        GUILD_A,
        claim1!.action.id,
        { status: 'sent', discordMessageId: 'msg1', renderHash: 'h1' },
        3000,
      );
      expect(done).toMatchObject({ status: 'sent', discordMessageId: 'msg1', renderHash: 'h1' });
      await s.setRenderHash(GUILD_A, claim1!.action.id, 'h2');
      expect((await s.listActions(GUILD_A, { eventIds: ['ev1'] }))[0]?.renderHash).toBe('h2');
      expect((await s.listActions(GUILD_B, { eventIds: ['ev1'] }))[0]?.id).toBe(claimB!.action.id);

      // Raid nights + isolation
      const rn = await s.insertRaidNight({
        guildId: GUILD_A,
        pollId: 'p1',
        name: 'MC Vote',
        instance: 'Molten Core',
        kind: 'raid',
        access: 'guild',
        size: 40,
        durationMinutes: 180,
        roleTargets: null,
        createdBy: 'leader',
        createdAt: 1000,
        outcome: 'pending',
        raidEventId: null,
        detail: null,
      });
      expect((await s.listRaidNights(GUILD_A)).map((x) => x.id)).toEqual([rn.id]);
      expect(await s.listRaidNights(GUILD_B)).toEqual([]);
      await expect(s.updateRaidNight(GUILD_B, rn.id, { outcome: 'cancelled' })).rejects.toThrow();

      // Announced state + isolation
      await s.upsertAnnouncedState?.([
        {
          guildId: GUILD_A,
          eventId: 'ev1',
          memberId: 'm1',
          signupId: 's1',
          characterName: 'Aeryn',
          class: 'warrior',
          spec: 'protection',
          role: 'tank',
          status: 'accepted',
          lateMinutes: null,
          note: null,
          seated: true,
          group: 1,
          roster: 'rostered',
          updatedAt: 1000,
          updatedBy: null,
          absenceSummary: null,
          announcedAt: 1000,
        },
      ]);
      expect(await s.listAnnouncedState?.(GUILD_A, ['ev1'])).toHaveLength(1);
      expect(await s.listAnnouncedState?.(GUILD_B, ['ev1'])).toEqual([]);
    });
  });
});

parity('pollsStore', createMemoryPollsStore, pollsStore, (setup) => {
  it('manages polls, votes, and posts isolated per guild', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const pollA = await s.insertPoll({
        guildId: GUILD_A,
        question: 'Which raid night?',
        description: null,
        options: [
          { id: 'wed', label: 'Wednesday', emoji: null, value: null },
          { id: 'thu', label: 'Thursday', emoji: null, value: null },
        ],
        method: 'single',
        maxChoices: null,
        eligibleTier: 'member',
        anonymous: false,
        resultsVisible: 'live',
        quorum: null,
        status: 'open',
        opensAt: null,
        closesAt: 50_000,
        createdBy: 'officer',
        closedBy: null,
        createdAt: 1000,
        closedAt: null,
        tags: ['raid-night'],
        configVersion: 1,
        results: null,
      });
      expect((await s.getPoll(GUILD_A, pollA.id))?.question).toBe('Which raid night?');
      expect(await s.getPoll(GUILD_B, pollA.id)).toBeNull();
      expect(await s.listPolls(GUILD_B)).toEqual([]);
      await expect(s.updatePoll(GUILD_B, pollA.id, { status: 'closed' })).rejects.toThrow();

      const voteA = await s.insertVote({
        guildId: GUILD_A,
        pollId: pollA.id,
        memberId: 'm1',
        choices: ['wed'],
        weight: 1,
        castAt: 2000,
        updatedAt: 2000,
      });
      expect(await s.countVotes(GUILD_A, pollA.id)).toBe(1);
      expect(await s.countVotes(GUILD_B, pollA.id)).toBe(0);
      expect((await s.getVoteByMember(GUILD_A, pollA.id, 'm1'))?.id).toBe(voteA.id);
      expect(await s.getVoteByMember(GUILD_B, pollA.id, 'm1')).toBeNull();
      await expect(
        s.updateVote(GUILD_B, voteA.id, { choices: ['thu'], updatedAt: 3000 }),
      ).rejects.toThrow();
      await s.deleteVote(GUILD_B, voteA.id);
      expect(await s.countVotes(GUILD_A, pollA.id)).toBe(1);

      const postA = await s.insertPost({
        guildId: GUILD_A,
        pollId: pollA.id,
        channelId: 'ch1',
        messageId: 'msg1',
        renderedKey: 'v1',
      });
      expect((await s.listPosts(GUILD_A, pollA.id)).map((p) => p.id)).toEqual([postA.id]);
      expect(await s.listPosts(GUILD_B, pollA.id)).toEqual([]);
      await expect(s.updatePost(GUILD_B, postA.id, { renderedKey: 'v2' })).rejects.toThrow();

      // Surveys, responses, and survey posts isolation (#65).
      const surveyA = await s.insertSurvey({
        guildId: GUILD_A,
        title: 'Feedback',
        description: null,
        questions: [
          {
            id: 'q1',
            prompt: 'How was it?',
            kind: 'single',
            required: true,
            options: [
              { id: 'o1', label: 'Good', emoji: null, value: null },
              { id: 'o2', label: 'Rough', emoji: null, value: null },
            ],
            maxChoices: null,
          },
        ],
        eligibleTier: 'raider',
        anonymous: true,
        resultsVisible: 'after-close',
        status: 'open',
        opensAt: null,
        closesAt: 50_000,
        createdBy: 'officer',
        closedBy: null,
        createdAt: 1000,
        closedAt: null,
        tags: ['raid-feedback'],
        configVersion: 1,
        results: null,
      });
      expect((await s.getSurvey(GUILD_A, surveyA.id))?.title).toBe('Feedback');
      expect(await s.getSurvey(GUILD_B, surveyA.id)).toBeNull();
      expect(await s.listSurveys(GUILD_B)).toEqual([]);
      await expect(s.updateSurvey(GUILD_B, surveyA.id, { status: 'closed' })).rejects.toThrow();

      const respA = await s.upsertSurveyResponse({
        guildId: GUILD_A,
        surveyId: surveyA.id,
        memberId: 'm1',
        answers: [{ questionId: 'q1', choices: ['o1'], text: null }],
        submittedAt: 2000,
        updatedAt: 2000,
      });
      expect(await s.countSurveyResponses(GUILD_A, surveyA.id)).toBe(1);
      expect(await s.countSurveyResponses(GUILD_B, surveyA.id)).toBe(0);
      expect((await s.getSurveyResponseByMember(GUILD_A, surveyA.id, 'm1'))?.id).toBe(respA.id);
      expect(await s.getSurveyResponseByMember(GUILD_B, surveyA.id, 'm1')).toBeNull();

      const spostA = await s.insertSurveyPost({
        guildId: GUILD_A,
        surveyId: surveyA.id,
        channelId: 'ch1',
        messageId: 'msg2',
        renderedKey: 'k1',
      });
      expect((await s.listSurveyPosts(GUILD_A, surveyA.id)).map((p) => p.id)).toEqual([spostA.id]);
      expect(await s.listSurveyPosts(GUILD_B, surveyA.id)).toEqual([]);
      await expect(s.updateSurveyPost(GUILD_B, spostA.id, { renderedKey: 'k2' })).rejects.toThrow();
    });
  });
});

parity('applicationsStore', createMemoryApplicationsStore, applicationsStore, (setup) => {
  it('stores applications and config with guildId isolation', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const appA = await s.insert({
        guildId: GUILD_A,
        discordId: '500000000000000001',
        applicantName: 'Dara',
        characterName: 'Daralis',
        wowClass: 'rogue',
        spec: 'combat',
        role: 'raider',
        about: 'Long-time raider',
        experience: 'Cleared MC',
        availability: 'Wed/Thu',
        status: 'new',
        labels: null,
        reply: null,
        reviewedBy: null,
        reviewedAt: null,
        postChannelId: null,
        postMessageId: null,
        onboardedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      });
      expect((await s.get(GUILD_A, appA.id))?.characterName).toBe('Daralis');
      expect(await s.get(GUILD_B, appA.id)).toBeNull();
      expect(await s.list(GUILD_B)).toEqual([]);
      await expect(s.update(GUILD_B, appA.id, { status: 'declined' })).rejects.toThrow();

      await s.setConfig(GUILD_A, { channelId: 'ch-rec' }, 2000);
      expect((await s.getConfig(GUILD_A)).channelId).toBe('ch-rec');
      expect((await s.getConfig(GUILD_B)).channelId).toBeNull();
    });
  });
});

parity('agentStore', createMemoryAgentStore, agentStore, (setup) => {
  it('isolates config, runs, sessions, confirmations, usage, and tool results by guildId', async () => {
    const { run } = await setup();

    await run(async (s) => {
      await s.setConfig(GUILD_A, { paused: true }, 1000, 'officer');
      expect((await s.getConfig(GUILD_A)).paused).toBe(true);
      expect((await s.getConfig(GUILD_B)).paused).toBe(false);

      const runA = await s.insertRun({
        guildId: GUILD_A,
        kind: 'ask',
        memberId: 'm1',
        surface: 'web',
        threadKey: 'web:t1:m1',
        label: null,
        prompt: 'Who is missing?',
        status: 'queued',
        answer: null,
        error: null,
        model: null,
        sessionId: null,
        toolCalls: [],
        confirmationIds: [],
        context: null,
        notes: [],
        draft: null,
        cancelRequested: false,
        inputTokens: null,
        createdAt: 1000,
        finishedAt: null,
      });
      expect((await s.getRun(GUILD_A, runA.id))?.prompt).toBe('Who is missing?');
      expect(await s.getRun(GUILD_B, runA.id)).toBeNull();
      expect(await s.countRuns(GUILD_A, { memberId: 'm1' })).toBe(1);
      expect(await s.countRuns(GUILD_B, { memberId: 'm1' })).toBe(0);
      await expect(s.updateRun(GUILD_B, runA.id, { status: 'cancelled' })).rejects.toThrow();

      await s.putSession({
        guildId: GUILD_A,
        threadKey: 'web:t1:m1',
        memberId: 'm1',
        sessionId: 'sess-1',
        createdAt: 1000,
        lastUsedAt: 1000,
      });
      expect((await s.getSession(GUILD_A, 'web:t1:m1'))?.sessionId).toBe('sess-1');
      expect(await s.getSession(GUILD_B, 'web:t1:m1')).toBeNull();
      expect(await s.listIdleSessions(GUILD_B, 5000)).toEqual([]);
      await s.deleteSession(GUILD_B, 'web:t1:m1');
      expect(await s.getSession(GUILD_A, 'web:t1:m1')).not.toBeNull();

      const confA = await s.insertConfirmation({
        guildId: GUILD_A,
        runId: runA.id,
        memberId: 'm1',
        command: 'raid-cancel',
        input: { eventId: 'ev1' },
        summary: 'Cancel raid',
        preview: { ok: true },
        confirmToken: 'tok-1',
        status: 'pending',
        result: null,
        createdAt: 1000,
        expiresAt: 2000,
        finishedAt: null,
      });
      expect((await s.getConfirmation(GUILD_A, confA.id))?.command).toBe('raid-cancel');
      expect(await s.getConfirmation(GUILD_B, confA.id)).toBeNull();
      expect(await s.listConfirmations(GUILD_B, runA.id)).toEqual([]);
      expect(await s.listExpiredConfirmations(GUILD_B, 5000)).toEqual([]);
      await expect(
        s.updateConfirmation(GUILD_B, confA.id, { status: 'declined', finishedAt: 3000 }),
      ).rejects.toThrow();

      expect(await s.bumpUsage(GUILD_A, '2026-11:asks')).toBe(1);
      expect(await s.getUsage(GUILD_B, '2026-11:asks')).toBe(0);

      await s.putToolResult({
        guildId: GUILD_A,
        runId: runA.id,
        callId: 'call-1',
        success: true,
        output: '{}',
        error: null,
      });
      expect((await s.getToolResult(GUILD_A, runA.id, 'call-1'))?.success).toBe(true);
      expect(await s.getToolResult(GUILD_B, runA.id, 'call-1')).toBeNull();
    });
  });
});

parity('insightsStore', createMemoryInsightsStore, insightsStore, (setup) => {
  it('isolates runs, cascading deletes, findings, and opt-ins per guild', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const rA = await s.insertRun({
        guildId: GUILD_A,
        runKey: 'run-1',
        zoneName: 'Molten Core',
        startedAt: 1000,
        durationSeconds: 3600,
        roster: ['Aeryn'],
        importedBy: 'officer',
        createdAt: 2000,
        sentAt: null,
      });
      await s.insertFindings([
        {
          guildId: GUILD_A,
          runId: rA.id,
          character: 'Aeryn',
          memberId: 'm1',
          kind: 'kicks',
          text: 'Solid interrupts',
          evidence: '98%',
          weight: 1,
        },
      ]);
      expect((await s.getRun(GUILD_A, rA.id))?.runKey).toBe('run-1');
      expect(await s.getRun(GUILD_B, rA.id)).toBeNull();
      expect(await s.getRunByKey(GUILD_B, 'run-1')).toBeNull();
      expect(await s.listRuns(GUILD_B, 10)).toEqual([]);
      expect(await s.listFindings(GUILD_B, rA.id)).toEqual([]);
      await expect(s.markSent(GUILD_B, rA.id, 3000)).rejects.toThrow();

      // Cross-guild deleteRun returns null and leaves GUILD_A intact.
      expect(await s.deleteRun(GUILD_B, rA.id)).toBeNull();
      expect(await s.listFindings(GUILD_A, rA.id)).toHaveLength(1);
      const removed = await s.deleteRun(GUILD_A, rA.id);
      expect(removed?.deletedFindings).toBe(1);
      expect(await s.listFindings(GUILD_A, rA.id)).toEqual([]);

      await s.setOptIn({ guildId: GUILD_A, memberId: 'm1', dms: true, updatedAt: 1000 });
      expect((await s.getOptIn(GUILD_A, 'm1'))?.dms).toBe(true);
      expect(await s.getOptIn(GUILD_B, 'm1')).toBeNull();
      expect(await s.listOptedIn(GUILD_A)).toEqual(['m1']);
      expect(await s.listOptedIn(GUILD_B)).toEqual([]);
    });
  });
});

parity('armoryStore', createMemoryArmoryStore, armoryStore, (setup) => {
  it('isolates armory links by guildId', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const linkA = await s.insertLink({
        guildId: GUILD_A,
        characterId: 'c1',
        name: 'Aeryn',
        surname: 'Iron',
        slug: 'aeryn-iron',
        status: 'pending',
        profile: null,
        equipment: [],
        avatarUrl: null,
        classMismatch: false,
        error: null,
        linkedBy: 'm1',
        linkedAt: 1000,
        requestedAt: 1000,
        checkedAt: null,
        fetchedAt: null,
      });
      expect((await s.getLink(GUILD_A, linkA.id))?.slug).toBe('aeryn-iron');
      expect(await s.getLink(GUILD_B, linkA.id)).toBeNull();
      expect(await s.getLinkByCharacter(GUILD_B, 'c1')).toBeNull();
      expect(await s.getLinkBySlug(GUILD_B, 'aeryn-iron')).toBeNull();
      expect(await s.listLinks(GUILD_B)).toEqual([]);
      await expect(s.updateLink(GUILD_B, linkA.id, { status: 'not-found' })).rejects.toThrow();
      await s.deleteLink(GUILD_B, linkA.id);
      expect(await s.getLink(GUILD_A, linkA.id)).not.toBeNull();
    });
  });
});

parity('rosterStore', createMemoryRosterStore, rosterStore, (setup) => {
  it('isolates roster entries and recipes by guildId', async () => {
    const { run } = await setup();

    await run(async (s) => {
      const entryA = await s.insertEntry({
        guildId: GUILD_A,
        blizzardId: 12345,
        name: 'Aeryn',
        surname: 'Iron',
        slug: 'aeryn-iron',
        guildRank: 1,
        level: 60,
        status: 'found',
        className: 'Warrior',
        raceName: 'Human',
        activeSpec: 'Protection',
        avatarUrl: null,
        profileUrl: null,
        error: null,
        professions: [],
        preferredRole: 'tank',
        alsoRoles: ['melee'],
        checkedAt: 1000,
      });
      expect((await s.listEntries(GUILD_A)).map((e) => e.id)).toEqual([entryA.id]);
      expect(await s.listEntries(GUILD_B)).toEqual([]);
      expect(await s.getEntryBySlug(GUILD_B, 'aeryn-iron')).toBeNull();
      await expect(s.updateEntry(GUILD_B, entryA.id, { level: 61 })).rejects.toThrow();

      await s.setRecipes(GUILD_A, entryA.id, [
        { id: 101, name: 'Lionheart Helm', profession: 'Blacksmithing' },
      ]);
      expect(await s.listRecipes(GUILD_A)).toHaveLength(1);
      expect(await s.listRecipes(GUILD_B)).toEqual([]);

      await s.deleteEntry(GUILD_B, entryA.id);
      expect(await s.listEntries(GUILD_A)).toHaveLength(1);
    });
  });
});

parity('catalogStore', createMemoryCatalogStore, catalogStore, (setup) => {
  it('isolates profession catalog and recipe details by guildId', async () => {
    const { run } = await setup();

    await run(async (s) => {
      await s.putCatalog({
        guildId: GUILD_A,
        profession: 'Alchemy',
        professionId: 171,
        categories: [
          {
            name: 'Flasks',
            recipes: [{ id: 201, name: 'Flask of the Titans' }],
          },
        ],
        syncedAt: 1000,
      });
      expect(await s.listCatalog(GUILD_A)).toHaveLength(1);
      expect(await s.listCatalog(GUILD_B)).toEqual([]);

      await s.putRecipeDetails([
        {
          guildId: GUILD_A,
          recipeId: 201,
          itemId: 13510,
          itemName: 'Flask of the Titans',
          quality: 'common',
          quantity: 1,
          lines: ['Increases maximum health by 1200.'],
          reagents: [],
          syncedAt: 1000,
        },
      ]);
      expect((await s.getRecipeDetail(GUILD_A, 201))?.itemName).toBe('Flask of the Titans');
      expect(await s.getRecipeDetail(GUILD_B, 201)).toBeNull();
      expect(await s.listRecipeItems(GUILD_B)).toEqual([]);
    });
  });
});

parity('wishlistStore', createMemoryWishlistStore, wishlistStore, (setup) => {
  it('replaces, queries, and isolates wishlist entries per guild and character', async () => {
    const { run } = await setup();

    await run(async (s) => {
      await s.replaceForCharacter(GUILD_A, 'char-1', [
        {
          guildId: GUILD_A,
          characterId: 'char-1',
          memberId: 'm1',
          itemId: 18803,
          itemName: 'Lava Dredger',
          rank: 2,
          note: null,
          updatedAt: 1000,
          updatedBy: 'm1',
        },
        {
          guildId: GUILD_A,
          characterId: 'char-1',
          memberId: 'm1',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          rank: 1,
          note: 'BiS',
          updatedAt: 1000,
          updatedBy: 'm1',
        },
      ]);
      await s.replaceForCharacter(GUILD_B, 'char-1', [
        {
          guildId: GUILD_B,
          characterId: 'char-1',
          memberId: 'm2',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          rank: 1,
          note: 'Other guild',
          updatedAt: 1000,
          updatedBy: 'm2',
        },
      ]);

      expect((await s.listByCharacter(GUILD_A, 'char-1')).map((e) => [e.itemId, e.rank])).toEqual([
        [17103, 1],
        [18803, 2],
      ]);
      expect((await s.listByItem(GUILD_A, 17103)).map((e) => e.note)).toEqual(['BiS']);
      expect((await s.listByItem(GUILD_B, 17103)).map((e) => e.note)).toEqual(['Other guild']);
      expect((await s.listAll(GUILD_A, { memberId: 'm1' })).length).toBe(2);
      expect(await s.listAll(GUILD_B, { memberId: 'm1' })).toEqual([]);

      // Replacing GUILD_B's char-1 must not touch GUILD_A's char-1.
      await s.replaceForCharacter(GUILD_B, 'char-1', []);
      expect(await s.listByCharacter(GUILD_B, 'char-1')).toEqual([]);
      expect(await s.listByCharacter(GUILD_A, 'char-1')).toHaveLength(2);
    });
  });
});

describe('Convex store adapter read-only guard', () => {
  it('refuses writes through a read-only QueryCtx', async () => {
    const t = await createConvexBackend();
    await expect(
      t.query(async (ctx) => {
        await siteStore(ctx).putProfile({
          guildId: GUILD_A,
          pills: [],
          intro: 'nope',
          aboutLead: '',
          aboutSections: [],
          discordInvite: null,
          contactEmail: null,
          updatedAt: 1000,
          updatedBy: 'officer',
        });
      }),
    ).rejects.toThrow(/must run through the `run` mutation/);
  });
});
