import { commandsFor } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { Poll, PollPost, PollStatus, PollsEvents, Vote } from './contract';

/**
 * The polls module's data port. Commands depend on this, not on Convex: production wires it
 * to the module's Convex component, tests use the memory store in `./testing`.
 */
export interface PollsStore {
  /**
   * Sorted by close time (open-ended last), then creation time. `closesBy` keeps only polls
   * with a close time at or before it, for the sweep.
   */
  listPolls(
    guildId: string,
    filter?: { statuses?: PollStatus[]; tag?: string; closesBy?: number },
  ): Promise<Poll[]>;
  getPoll(guildId: string, pollId: string): Promise<Poll | null>;
  insertPoll(poll: Omit<Poll, 'id'>): Promise<Poll>;
  updatePoll(
    guildId: string,
    pollId: string,
    patch: Partial<Omit<Poll, 'id' | 'guildId'>>,
  ): Promise<Poll>;

  /** Sorted by first cast time. */
  listVotes(guildId: string, pollId: string): Promise<Vote[]>;
  countVotes(guildId: string, pollId: string): Promise<number>;
  getVoteByMember(guildId: string, pollId: string, memberId: string): Promise<Vote | null>;
  /** Throws if the member already has a vote on the poll: one ballot per member. */
  insertVote(vote: Omit<Vote, 'id'>): Promise<Vote>;
  updateVote(
    guildId: string,
    voteId: string,
    patch: Partial<Pick<Vote, 'choices' | 'weight' | 'updatedAt'>>,
  ): Promise<Vote>;
  deleteVote(guildId: string, voteId: string): Promise<void>;

  listPosts(guildId: string, pollId: string): Promise<PollPost[]>;
  insertPost(post: Omit<PollPost, 'id'>): Promise<PollPost>;
  updatePost(
    guildId: string,
    postId: string,
    patch: Partial<Pick<PollPost, 'renderedKey'>>,
  ): Promise<PollPost>;
}

/**
 * What polls reads from identity. apps/api adapts identity's store to this; polls never
 * touches identity's tables (PLAN §4.3).
 */
export interface PollsMembers {
  getMember(guildId: string, memberId: string): Promise<Member | null>;
  /** Everyone who could vote, for "12 of 30 voted". */
  listMembers(guildId: string): Promise<Member[]>;
}

/** Publishes polls events on the core bus. */
export interface PollsEventSink {
  emit<K extends keyof PollsEvents>(
    guildId: string,
    type: K,
    payload: PollsEvents[K],
  ): Promise<void>;
}

export interface PollsDeps {
  polls: PollsStore;
  members: PollsMembers;
  events: PollsEventSink;
}

export const command = commandsFor<PollsDeps>();
