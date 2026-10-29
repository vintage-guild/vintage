import { decodeRaidImport } from '@vintage/bridge-format';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import type { WowClass } from '@vintage/wow-data';
import { describe, expect, it } from 'vitest';
import { benchReason, buildImportString, renderImportString } from '../src/domain/render';
import type { TickEvent } from '../src/store';

const NOW = Date.UTC(2026, 9, 29);

const event: RaidEvent = {
  id: 'raid-1',
  guildId: 'guild-test',
  scheduleId: null,
  name: 'Onyxia',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 10,
  startsAt: NOW + 50 * 3600 * 1000,
  durationMinutes: 120,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  notes: null,
  configVersion: 1,
};

let n = 0;
function signup(cls: WowClass, spec: string, role: Signup['role'], patch: Partial<Signup> = {}) {
  n += 1;
  return {
    id: `signup-${n}`,
    guildId: 'guild-test',
    eventId: 'raid-1',
    memberId: `member-${n}`,
    characterId: `char-${n}`,
    characterName: `Raider${String.fromCharCode(96 + n)}`,
    class: cls,
    spec,
    role,
    status: 'accepted',
    note: null,
    signedUpAt: NOW - (100 - n) * 60_000,
    updatedAt: NOW,
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
    ...patch,
  } satisfies Signup;
}

describe('benchReason', () => {
  it('reads a Standby answer as standby, the queue as queued, and anything else as benched', () => {
    const s = signup('mage', 'frost', 'ranged');
    expect(benchReason({ ...s, status: 'bench' })).toBe('standby');
    expect(benchReason({ ...s, status: 'bench', roster: 'benched' })).toBe('standby');
    expect(benchReason({ ...s, queued: true })).toBe('queued');
    expect(benchReason({ ...s, queued: true, roster: 'benched' })).toBe('benched');
    expect(benchReason({ ...s, roster: 'benched' })).toBe('benched');
    expect(benchReason({ ...s, status: 'tentative' })).toBe('benched');
  });
});

describe('buildImportString', () => {
  it("carries the comp's bench when no leader roster is set", () => {
    const signups = [
      signup('warrior', 'protection', 'tank'),
      signup('warrior', 'protection', 'tank'),
      signup('priest', 'holy', 'healer'),
      signup('priest', 'holy', 'healer'),
      signup('druid', 'restoration', 'healer'),
      ...Array.from({ length: 5 }, () => signup('mage', 'frost', 'ranged')),
      signup('rogue', 'combat', 'melee', { queued: true }),
      signup('warlock', 'affliction', 'ranged', { status: 'bench' }),
    ];
    const tick: TickEvent = { event, timings: DEFAULT_TIMINGS, signups };
    const { characters, encoded } = buildImportString(tick, [], 'guild-test', NOW);
    expect(characters).toBe(10);
    expect(encoded.ok).toBe(true);
    const decoded = decodeRaidImport(encoded.ok ? encoded.value : '');
    if (!decoded.ok) throw new Error(decoded.error.message);
    const queued = signups.at(-2)!;
    const standby = signups.at(-1)!;
    expect(decoded.value.bench).toEqual([
      expect.objectContaining({ characterId: queued.characterId, reason: 'queued' }),
      expect.objectContaining({
        characterId: standby.characterId,
        name: standby.characterName,
        class: 'warlock',
        spec: 'affliction',
        role: 'ranged',
        reason: 'standby',
      }),
    ]);
    const rostered = new Set(decoded.value.roster.map((r) => r.characterId));
    expect(decoded.value.bench?.some((b) => rostered.has(b.characterId))).toBe(false);
  });

  it('posts the string without its bench when only that fits one Discord message', () => {
    // Character ids as long and random as Convex ids, so the string compresses like a real one.
    const id = (i: number) => {
      let x = Math.imul(i + 1, 2_654_435_761) >>> 0 || 1;
      let out = '';
      while (out.length < 32) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        x >>>= 0;
        out += (x % 36).toString(36);
      }
      return out;
    };
    const people = (count: number, from: number, patch: Partial<Signup>) =>
      Array.from({ length: count }, (_, i) =>
        signup('mage', 'frost', 'ranged', { characterId: id(from + i), ...patch }),
      );
    const going = people(20, 0, { roster: 'rostered' }).map((s, i) => ({
      ...s,
      group: Math.floor(i / 5) + 1,
    }));
    const fits = (signups: Signup[]) =>
      renderImportString({ event, timings: DEFAULT_TIMINGS, signups }, [], 'guild-test', NOW)
        .content ?? '';

    const small = fits([...going, ...people(2, 100, { roster: 'benched' })]);
    const withBench = decodeRaidImport(/```\n(.+)\n```/.exec(small)?.[1] ?? '');
    expect(withBench).toMatchObject({ ok: true, value: { bench: [{}, {}] } });

    const big = fits([...going, ...people(40, 100, { roster: 'benched' })]);
    expect(big.length).toBeLessThanOrEqual(2000);
    expect(big).toMatch(/The bench is left out to fit/);
    const lean = decodeRaidImport(/```\n(.+)\n```/.exec(big)?.[1] ?? '');
    expect(lean).toMatchObject({ ok: true, value: { bench: [] } });
    expect(lean.ok && lean.value.roster).toHaveLength(20);
  });

  it('gives an empty bench when everyone plays', () => {
    const tick: TickEvent = {
      event,
      timings: DEFAULT_TIMINGS,
      signups: [signup('warrior', 'protection', 'tank')],
    };
    const { encoded } = buildImportString(tick, [], 'guild-test', NOW);
    const decoded = decodeRaidImport(encoded.ok ? encoded.value : '');
    expect(decoded).toMatchObject({ ok: true, value: { bench: [] } });
  });
});
