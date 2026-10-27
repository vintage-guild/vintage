// commands.read must not tell a caller that a command they may not run exists.
import { makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { refuseMutationInRead } from '../src/read-only';
import { commands, type VintageDeps } from '../src/registry';

const registry = testRegistry<VintageDeps>([...commands]);
const system = makeCaller('officer', { surface: 'system', memberId: undefined });

describe('refuseMutationInRead', () => {
  it('tells a caller who may run a mutation to use commands.run', () => {
    expect(refuseMutationInRead(registry, makeCaller('officer'), 'guild-roles-set')).toMatchObject({
      success: false,
      error: { code: 'USE_RUN' },
    });
    expect(refuseMutationInRead(registry, system, 'member-sync')).toMatchObject({
      error: { code: 'USE_RUN' },
    });
  });

  it('says nothing about a mutation the caller may not run, so the registry answers not found', async () => {
    for (const [caller, name] of [
      [makeCaller('officer'), 'member-sync'],
      [makeCaller('public'), 'member-sync'],
      [makeCaller('raider'), 'guild-roles-set'],
    ] as const) {
      expect(refuseMutationInRead(registry, caller, name), `${caller.tier} ${name}`).toBeNull();
      const result = await registry.execute({ name, input: {}, caller }, {} as VintageDeps);
      expect(result).toMatchObject({ error: { code: 'COMMAND_NOT_FOUND' } });
    }
  });

  it('lets reads and unknown names through to the registry', () => {
    expect(refuseMutationInRead(registry, makeCaller('raider'), 'member-list')).toBeNull();
    expect(refuseMutationInRead(registry, makeCaller('officer'), 'no-such-command')).toBeNull();
  });
});
