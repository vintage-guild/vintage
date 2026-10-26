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

  it('replaces the whole needs list, in the order given, specs defaulting to any', async () => {
    await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'druid', need: 'high' },
          { wowClass: 'warrior', specs: 'protection', need: 'closed' },
        ],
      },
      officer,
    );
    expect((await read()).needs).toEqual([
      { wowClass: 'druid', specs: 'any', need: 'high' },
      { wowClass: 'warrior', specs: 'protection', need: 'closed' },
    ]);
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

  it('refuses a class twice, an unknown class, and an empty change', async () => {
    const twice = await run(
      'recruiting-set',
      {
        needs: [
          { wowClass: 'mage', need: 'high' },
          { wowClass: 'mage', specs: 'frost', need: 'medium' },
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
