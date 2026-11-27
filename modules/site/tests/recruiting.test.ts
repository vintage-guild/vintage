import type { Caller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { siteCommands } from '../src/commands';
import { type Recruiting, STARTER_RECRUITING } from '../src/contract';
import type { SiteDeps } from '../src/store';
import { createMemorySiteDeps } from '../src/testing';

const NOW = Date.UTC(2026, 9, 26, 18);

const officer = makeCaller('officer');
const leader = makeCaller('leader');
const visitor = makeCaller('public');

let deps: ReturnType<typeof createMemorySiteDeps>;
let registry: ReturnType<typeof testRegistry<SiteDeps>>;

beforeEach(() => {
  deps = createMemorySiteDeps();
  registry = testRegistry<SiteDeps>([...siteCommands], fixedClock(NOW));
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, deps);

const code = (result: Awaited<ReturnType<typeof run>>) =>
  result.success ? 'OK' : result.error?.code;

const read = async (caller: Caller = visitor) => {
  const result = await run('recruiting-get', {}, caller);
  if (!result.success) throw new Error(`recruiting-get failed: ${result.error?.code}`);
  return result.data as Recruiting;
};

describe('recruiting-get', () => {
  it('answers the starter text to anyone until an officer saves the band', async () => {
    expect(await read()).toEqual(STARTER_RECRUITING);
    expect((await read()).updatedAt).toBeNull();
  });
});

describe('recruiting-set', () => {
  it('changes only the fields given and stamps who and when', async () => {
    const result = await run('recruiting-set', { headline: '  Healers, please.  ' }, officer);
    expect(code(result)).toBe('OK');
    const band = await read();
    expect(band.headline).toBe('Healers, please.');
    expect(band.pitch).toBe(STARTER_RECRUITING.pitch);
    expect(band.needs).toEqual(STARTER_RECRUITING.needs);
    expect(band.updatedAt).toBe(NOW);
    expect(band).not.toHaveProperty('updatedBy');
    expect(deps.site.recruiting.get(officer.guildId)?.updatedBy).toBe(officer.memberId);
  });

  it('replaces the whole needs list, in the order given, role and specs defaulting to any', async () => {
    await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'druid', need: 'high' },
          { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'closed' },
        ],
      },
      officer,
    );
    expect((await read()).needs).toEqual([
      { wowClass: 'druid', role: 'any', specs: 'any', need: 'high' },
      { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'closed' },
    ]);
  });

  it('lists one class once per role, with low between medium and closed', async () => {
    await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'druid', role: 'tank', specs: 'feral', need: 'low' },
          { wowClass: 'hunter', role: 'ranged', need: 'closed' },
          { wowClass: 'druid', role: 'healer', specs: 'restoration', need: 'high' },
          { wowClass: 'mage', role: 'ranged', need: 'medium' },
        ],
      },
      officer,
    );
    expect((await read()).needs.map((n) => `${n.wowClass} ${n.role} ${n.need}`)).toEqual([
      'druid healer high',
      'mage ranged medium',
      'druid tank low',
      'hunter ranged closed',
    ]);
  });

  it('refuses a role the class can’t play', async () => {
    const result = await run(
      'recruiting-set',
      { needs: [{ wowClass: 'mage', role: 'tank', need: 'high' }] },
      officer,
    );
    expect(code(result)).toBe('ROLE_NOT_PLAYED');
  });

  it('answers needs high, medium, closed whatever order they were saved in', async () => {
    await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'warrior', specs: 'protection', need: 'closed' },
          { wowClass: 'mage', need: 'medium' },
          { wowClass: 'priest', need: 'high' },
          { wowClass: 'rogue', need: 'closed' },
          { wowClass: 'shaman', need: 'high' },
        ],
      },
      officer,
    );
    expect((await read()).needs.map((n) => `${n.wowClass}:${n.need}`)).toEqual([
      'priest:high',
      'shaman:high',
      'mage:medium',
      'warrior:closed',
      'rogue:closed',
    ]);
  });

  it('keeps each guild to its own band', async () => {
    const other = { ...officer, guildId: 'guild_other' };
    await run('recruiting-set', { headline: 'Theirs' }, other);
    expect((await read()).headline).toBe(STARTER_RECRUITING.headline);
  });

  it('refuses a class and role twice, an unknown class, and an empty change', async () => {
    const twice = await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'mage', role: 'ranged', need: 'high' },
          { wowClass: 'mage', role: 'ranged', specs: 'frost', need: 'medium' },
        ],
      },
      officer,
    );
    expect(code(twice)).toBe('DUPLICATE_CLASS');
    expect(
      code(await run('recruiting-set', { needs: [{ wowClass: 'monk', need: 'high' }] }, officer)),
    ).toBe('VALIDATION_ERROR');
    expect(code(await run('recruiting-set', {}, officer))).toBe('NOTHING_TO_CHANGE');
    expect(code(await run('recruiting-set', { headline: '   ' }, officer))).toBe(
      'VALIDATION_ERROR',
    );
    expect((await read()).updatedAt).toBeNull();
  });

  it('is for officers: leaders and visitors are told it does not exist', async () => {
    expect(code(await run('recruiting-set', { headline: 'x' }, leader))).toBe('COMMAND_NOT_FOUND');
    expect(code(await run('recruiting-set', { headline: 'x' }, visitor))).toBe('COMMAND_NOT_FOUND');
  });
});
