import type { CommandResult } from '@vintage/guild-kit';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';
import { type ConvexCalls, convexCommandClient } from '../src/commands';
import { siteUrlOf } from '../src/connect';
import { type MemberMe, toWebSession } from '../src/session';

/** Records which Convex function each call hit and with what. */
function fakeConvex() {
  const calls: { kind: string; fn: string; args: unknown }[] = [];
  const ok: CommandResult<unknown> = { success: true, data: { hi: true } };
  const convex: ConvexCalls = {
    async query(ref, args) {
      calls.push({ kind: 'query', fn: getFunctionName(ref), args });
      return ok;
    },
    async mutation(ref, args) {
      calls.push({ kind: 'mutation', fn: getFunctionName(ref), args });
      return ok;
    },
  };
  return { calls, client: convexCommandClient(convex) };
}

describe('convexCommandClient', () => {
  it('reads through the commands:read query, with {} when there is no input', async () => {
    const { calls, client } = fakeConvex();
    expect(await client.read('member-me')).toEqual({ success: true, data: { hi: true } });
    await client.read('raid-list', { status: 'open' });
    expect(calls).toEqual([
      { kind: 'query', fn: 'commands:read', args: { name: 'member-me', input: {} } },
      {
        kind: 'query',
        fn: 'commands:read',
        args: { name: 'raid-list', input: { status: 'open' } },
      },
    ]);
  });

  it('runs through the commands:run mutation, passing a confirm token only when given', async () => {
    const { calls, client } = fakeConvex();
    await client.run('character-add', { name: 'Aeryn' });
    await client.run('character-remove', { id: 'c1' }, { confirmToken: 'tok' });
    expect(calls).toEqual([
      {
        kind: 'mutation',
        fn: 'commands:run',
        args: { name: 'character-add', input: { name: 'Aeryn' } },
      },
      {
        kind: 'mutation',
        fn: 'commands:run',
        args: { name: 'character-remove', input: { id: 'c1' }, confirmToken: 'tok' },
      },
    ]);
  });
});

describe('toWebSession', () => {
  const user = { name: 'aeryn_discord', image: 'https://cdn.discordapp.com/avatars/1/abc.png' };
  const me = (prefs: { timezone?: string } = {}): CommandResult<MemberMe> => ({
    success: true,
    data: {
      member: { id: 'm1', displayName: 'Aeryn', tier: 'raider', rank: 'raider', prefs },
    },
  });

  it('a guild member: their member id, tier, rank, timezone, and Discord avatar', () => {
    expect(toWebSession(user, me({ timezone: 'America/Chicago' }))).toEqual({
      memberId: 'm1',
      displayName: 'Aeryn',
      tier: 'raider',
      rank: 'raider',
      avatarUrl: 'https://cdn.discordapp.com/avatars/1/abc.png',
      timezone: 'America/Chicago',
    });
    expect(toWebSession({ name: 'x' }, me())).not.toHaveProperty('timezone');
    expect(toWebSession({ name: 'x' }, me())).not.toHaveProperty('avatarUrl');
  });

  it('signed in but not a guild member: public, named and pictured from Discord', () => {
    const denied: CommandResult<MemberMe> = {
      success: false,
      error: { code: 'NOT_SIGNED_IN', message: 'no member', retryable: false },
    };
    expect(toWebSession(user, denied)).toEqual({
      memberId: null,
      displayName: 'aeryn_discord',
      tier: 'public',
      rank: null,
      avatarUrl: user.image,
    });
  });
});

describe('siteUrlOf', () => {
  it('maps a deployment URL to its HTTP actions URL, where the auth routes live', () => {
    expect(siteUrlOf('https://dusty-sardine-902.convex.cloud')).toBe(
      'https://dusty-sardine-902.convex.site',
    );
  });
});
