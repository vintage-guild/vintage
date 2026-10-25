import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Caller } from './caller';
import { defineGuildCommand } from './define';
import { success } from './index';
import { toManifest } from './manifest';
import { createGuildRegistry } from './registry';

const officer: Caller = { surface: 'web', guildId: 'g1', tier: 'officer', memberId: 'm-officer' };
const raider: Caller = { surface: 'mcp', guildId: 'g1', tier: 'raider', memberId: 'm-raider' };

const removed: string[] = [];
const commands = [
  defineGuildCommand({
    name: 'thing-list',
    description: 'List things',
    tier: 'member',
    input: z.object({}),
    handler: async () => success(['a', 'b']),
  }),
  defineGuildCommand({
    name: 'thing-remove',
    description: 'Remove a thing',
    tier: 'officer',
    destructive: true,
    input: z.object({ id: z.string() }),
    handler: async ({ id }, ctx) => {
      if (!ctx.dryRun) removed.push(id);
      return success({ id, removed: !ctx.dryRun });
    },
  }),
];

let clock = 1_000_000;
const registry = createGuildRegistry({ commands, confirmSecret: 'test-secret', now: () => clock });

describe('createGuildRegistry', () => {
  it('runs a permitted command', async () => {
    const result = await registry.execute({ name: 'thing-list', input: {}, caller: raider }, {});
    expect(result).toMatchObject({ success: true, data: ['a', 'b'] });
  });

  it('hides commands above the caller tier as not found', async () => {
    const result = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: raider },
      {},
    );
    expect(result).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
    expect(registry.visibleTo(raider).map((c) => c.name)).toEqual(['thing-list']);
  });

  it('rejects invalid input with VALIDATION_ERROR', async () => {
    const result = await registry.execute(
      { name: 'thing-remove', input: { id: 7 }, caller: officer },
      {},
    );
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('previews a destructive command, then runs it with the token', async () => {
    removed.length = 0;
    const preview = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: officer },
      {},
    );
    expect(preview.success).toBe(true);
    expect(removed).toEqual([]);
    const { confirmToken } = preview.data as { confirmToken: string };

    const done = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: officer, confirmToken },
      {},
    );
    expect(done).toMatchObject({ success: true, data: { removed: true } });
    expect(removed).toEqual(['x']);
  });

  it('refuses a token for different input, another caller, or after expiry', async () => {
    const preview = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: officer },
      {},
    );
    const { confirmToken } = preview.data as { confirmToken: string };

    const otherInput = await registry.execute(
      { name: 'thing-remove', input: { id: 'y' }, caller: officer, confirmToken },
      {},
    );
    expect(otherInput).toMatchObject({
      error: { code: 'CONFIRMATION_INVALID', message: expect.stringContaining('mismatch') },
    });

    const otherCaller = await registry.execute(
      {
        name: 'thing-remove',
        input: { id: 'x' },
        caller: { ...officer, memberId: 'm-2' },
        confirmToken,
      },
      {},
    );
    expect(otherCaller).toMatchObject({ error: { code: 'CONFIRMATION_INVALID' } });

    clock += 6 * 60 * 1000;
    const expired = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: officer, confirmToken },
      {},
    );
    expect(expired).toMatchObject({ error: { message: expect.stringContaining('expired') } });
  });

  it('rejects duplicate names and non-kebab names', () => {
    expect(() =>
      createGuildRegistry({ commands: [commands[0]!, commands[0]!], confirmSecret: 's' }),
    ).toThrow(/Duplicate/);
    expect(() =>
      defineGuildCommand({
        name: 'member.me',
        description: 'x',
        tier: 'member',
        input: z.object({}),
        handler: async () => success(null),
      }),
    ).toThrow(/kebab-case/);
  });

  it('produces a sorted manifest with JSON schemas', () => {
    const manifest = toManifest(commands);
    expect(manifest.commands.map((c) => c.name)).toEqual(['thing-list', 'thing-remove']);
    expect(manifest.commands[1]).toMatchObject({
      tier: 'officer',
      destructive: true,
      mutation: true,
    });
    expect(manifest.commands[1]?.input).toMatchObject({ type: 'object', required: ['id'] });
  });
});
