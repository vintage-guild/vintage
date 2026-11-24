import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Caller } from './caller';
import { hashInput, issueConfirmToken, verifyConfirmToken } from './confirm';
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

    const otherGuild = await registry.execute(
      {
        name: 'thing-remove',
        input: { id: 'x' },
        caller: { ...officer, guildId: 'g2' },
        confirmToken,
      },
      {},
    );
    expect(otherGuild).toMatchObject({
      error: { code: 'CONFIRMATION_INVALID', message: expect.stringContaining('mismatch') },
    });

    clock += 6 * 60 * 1000;
    const expired = await registry.execute(
      { name: 'thing-remove', input: { id: 'x' }, caller: officer, confirmToken },
      {},
    );
    expect(expired).toMatchObject({ error: { message: expect.stringContaining('expired') } });
  });

  it('rejects malformed and tampered confirm tokens', async () => {
    const claims = {
      command: 'thing-remove',
      inputHash: await hashInput({ id: 'x' }),
      subject: 'm-officer',
      guildId: 'g1',
    };
    const token = await issueConfirmToken('test-secret', claims, 1_000_000);
    const [payload, sig] = token.split('.');
    expect(await verifyConfirmToken('test-secret', token, claims, 1_000_000)).toEqual({ ok: true });

    // Flip a character in the signature.
    const flipped = `${sig![0] === 'A' ? 'B' : 'A'}${sig!.slice(1)}`;
    expect(
      await verifyConfirmToken('test-secret', `${payload}.${flipped}`, claims, 1_000_000),
    ).toEqual({
      ok: false,
      reason: 'bad-signature',
    });

    // Wrong secret, wrong length, invalid base64url, and extra dot.
    expect(await verifyConfirmToken('other-secret', token, claims, 1_000_000)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(await verifyConfirmToken('test-secret', `${payload}.short`, claims, 1_000_000)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(
      await verifyConfirmToken('test-secret', `${payload}.not+valid/b64=`, claims, 1_000_000),
    ).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(await verifyConfirmToken('test-secret', `${token}.extra`, claims, 1_000_000)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(
      await verifyConfirmToken('test-secret', token, { ...claims, guildId: 'g2' }, 1_000_000),
    ).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  describe('system-only commands', () => {
    const synced: string[] = [];
    const sync = defineGuildCommand({
      name: 'thing-sync',
      description: 'Sync a thing from an external source',
      tier: 'officer',
      mutation: true,
      systemOnly: true,
      input: z.object({ id: z.string() }),
      handler: async ({ id }) => {
        synced.push(id);
        return success({ id });
      },
    });
    const reg = createGuildRegistry({ commands: [...commands, sync], confirmSecret: 's' });
    const system: Caller = { surface: 'system', guildId: 'g1', tier: 'officer' };

    it('runs for the system caller only, and looks unknown to every other surface', async () => {
      synced.length = 0;
      for (const surface of ['web', 'mcp', 'discord', 'agent', 'cli'] as const) {
        const result = await reg.execute(
          { name: 'thing-sync', input: { id: surface }, caller: { ...officer, surface } },
          {},
        );
        expect(result, surface).toMatchObject({
          success: false,
          error: { code: 'COMMAND_NOT_FOUND' },
        });
      }
      expect(synced).toEqual([]);
      const ok = await reg.execute({ name: 'thing-sync', input: { id: 'x' }, caller: system }, {});
      expect(ok).toMatchObject({ success: true, data: { id: 'x' } });
      expect(synced).toEqual(['x']);
    });

    it('is hidden from discovery for anyone but the system caller', () => {
      expect(reg.visibleTo(officer).map((c) => c.name)).not.toContain('thing-sync');
      expect(reg.visibleTo(system).map((c) => c.name)).toContain('thing-sync');
    });

    it('is marked in the manifest; ordinary commands are not', () => {
      const manifest = toManifest([...commands, sync]);
      expect(manifest.commands.find((c) => c.name === 'thing-sync')).toMatchObject({
        systemOnly: true,
      });
      expect(manifest.commands.find((c) => c.name === 'thing-list')).not.toHaveProperty(
        'systemOnly',
      );
    });
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
