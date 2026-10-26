import type { Member } from '@vintage/identity/contract';
import type { Poll, PollPost, PollsEvents, Vote } from './contract';
import type { PollsDeps, PollsEventSink, PollsMembers, PollsStore } from './store';

/** In-memory PollsStore for tests and local agents. Same behavior contract as the Convex component. */
export function createMemoryPollsStore(): PollsStore & {
  polls: Map<string, Poll>;
  votes: Map<string, Vote>;
  posts: Map<string, PollPost>;
} {
  const polls = new Map<string, Poll>();
  const votes = new Map<string, Vote>();
  const posts = new Map<string, PollPost>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${++seq}`;
  const inGuild = <T extends { guildId: string }>(value: T | undefined, guildId: string) =>
    value && value.guildId === guildId ? value : null;
  const must = <T>(value: T | null, what: string): T => {
    if (!value) throw new Error(`${what} not found`);
    return value;
  };
  const votesFor = (guildId: string, pollId: string) =>
    [...votes.values()].filter((v) => v.guildId === guildId && v.pollId === pollId);

  return {
    polls,
    votes,
    posts,

    async listPolls(guildId, filter = {}) {
      const { statuses, tag, closesBy } = filter;
      return [...polls.values()]
        .filter(
          (p) =>
            p.guildId === guildId &&
            (statuses === undefined || statuses.includes(p.status)) &&
            (tag === undefined || p.tags.includes(tag)) &&
            (closesBy === undefined || (p.closesAt !== null && p.closesAt <= closesBy)),
        )
        .sort(
          (a, b) =>
            (a.closesAt ?? Number.POSITIVE_INFINITY) - (b.closesAt ?? Number.POSITIVE_INFINITY) ||
            a.createdAt - b.createdAt,
        );
    },
    async getPoll(guildId, pollId) {
      return inGuild(polls.get(pollId), guildId);
    },
    async insertPoll(input) {
      const poll = { ...input, id: id('poll') };
      polls.set(poll.id, poll);
      return poll;
    },
    async updatePoll(guildId, pollId, patch) {
      const updated = { ...must(inGuild(polls.get(pollId), guildId), 'poll'), ...patch };
      polls.set(pollId, updated);
      return updated;
    },

    async listVotes(guildId, pollId) {
      return votesFor(guildId, pollId).sort((a, b) => a.castAt - b.castAt);
    },
    async countVotes(guildId, pollId) {
      return votesFor(guildId, pollId).length;
    },
    async getVoteByMember(guildId, pollId, memberId) {
      return votesFor(guildId, pollId).find((v) => v.memberId === memberId) ?? null;
    },
    async insertVote(input) {
      if (votesFor(input.guildId, input.pollId).some((v) => v.memberId === input.memberId)) {
        throw new Error('member already voted on this poll');
      }
      const vote = { ...input, id: id('vote') };
      votes.set(vote.id, vote);
      return vote;
    },
    async updateVote(guildId, voteId, patch) {
      const updated = { ...must(inGuild(votes.get(voteId), guildId), 'vote'), ...patch };
      votes.set(voteId, updated);
      return updated;
    },
    async deleteVote(guildId, voteId) {
      if (inGuild(votes.get(voteId), guildId)) votes.delete(voteId);
    },

    async listPosts(guildId, pollId) {
      return [...posts.values()].filter((p) => p.guildId === guildId && p.pollId === pollId);
    },
    async insertPost(input) {
      const post = { ...input, id: id('post') };
      posts.set(post.id, post);
      return post;
    },
    async updatePost(guildId, postId, patch) {
      const updated = { ...must(inGuild(posts.get(postId), guildId), 'post'), ...patch };
      posts.set(postId, updated);
      return updated;
    },
  };
}

/** Members for polls tests. */
export function createMemoryPollsMembers(members: Member[] = []): PollsMembers {
  return {
    getMember: async (guildId, memberId) =>
      members.find((m) => m.guildId === guildId && m.id === memberId) ?? null,
    listMembers: async (guildId) => members.filter((m) => m.guildId === guildId),
  };
}

export type EmittedEvent = {
  [K in keyof PollsEvents]: { guildId: string; type: K; payload: PollsEvents[K] };
}[keyof PollsEvents];

/** Records emitted events so tests can assert on them. */
export function createRecordingEventSink(): PollsEventSink & { emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = [];
  return {
    emitted,
    async emit(guildId, type, payload) {
      emitted.push({ guildId, type, payload } as EmittedEvent);
    },
  };
}

export function createMemoryPollsDeps(members: Member[] = []): PollsDeps & {
  polls: ReturnType<typeof createMemoryPollsStore>;
  pollEvents: ReturnType<typeof createRecordingEventSink>;
} {
  return {
    polls: createMemoryPollsStore(),
    pollMembers: createMemoryPollsMembers(members),
    pollEvents: createRecordingEventSink(),
  };
}
