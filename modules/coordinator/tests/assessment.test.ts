import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  assessmentFacts,
  assessmentRule,
  assessmentSlot,
  buildAssessment,
  parseRaiseNeedCustomId,
  raiseNeedCustomId,
  renderAssessment,
} from '../src/domain/assessment';
import type { TickEvent, TickMember } from '../src/store';

const MONDAY_17 = Date.UTC(2026, 10, 2, 17); // Mon 2 Nov 2026

const event = (id: string, startsAt: number): RaidEvent => ({
  id,
  guildId: 'g',
  scheduleId: null,
  name: 'Molten Core',
  instance: 'Molten Core',
  size: 10,
  startsAt,
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  configVersion: 1,
});

const signup = (memberId: string, role: Signup['role'], cls: Signup['class']): Signup => ({
  id: `s-${memberId}`,
  guildId: 'g',
  eventId: 'r1',
  memberId,
  characterId: `c-${memberId}`,
  characterName: memberId,
  class: cls,
  spec: 'x',
  role,
  status: 'accepted',
  note: null,
  signedUpAt: 0,
  updatedAt: 0,
  roster: 'pending',
  group: null,
  queued: false,
  promotedAt: null,
});

const members: TickMember[] = ['a', 'b', 'c'].map((id) => ({
  memberId: id,
  discordId: `d-${id}`,
  displayName: id,
  rank: 'raider',
  dmOptOut: false,
}));

const tick = (signups: Signup[]): TickEvent => ({
  event: event('r1', MONDAY_17 + 3 * 24 * 3600 * 1000),
  timings: DEFAULT_TIMINGS,
  signups,
});

describe('the weekly slot', () => {
  it('is Monday 16:00 UTC, keyed by that date', () => {
    expect(new Date(assessmentSlot(MONDAY_17)).toISOString()).toBe('2026-11-02T16:00:00.000Z');
    expect(assessmentRule(MONDAY_17)).toBe('assessment-2026-11-02');
    expect(assessmentRule(Date.UTC(2026, 10, 2, 15))).toBeNull();
    expect(assessmentRule(Date.UTC(2026, 10, 8, 23))).toBe('assessment-2026-11-02'); // Sunday
    expect(assessmentRule(Date.UTC(2026, 10, 9, 16))).toBe('assessment-2026-11-09');
  });
});

describe('buildAssessment', () => {
  it('suggests raising the classes that can fill a tank or healer gap, listed ones first', () => {
    // A ten-person raid with three DPS: short on tanks and healers.
    const a = buildAssessment(
      [
        tick([
          signup('a', 'melee', 'rogue'),
          signup('b', 'ranged', 'mage'),
          signup('c', 'ranged', 'warlock'),
        ]),
      ],
      members,
      [
        { wowClass: 'shaman', specs: 'restoration', need: 'medium' },
        { wowClass: 'warrior', specs: 'protection', need: 'high' },
      ],
    );
    expect(a.gaps.map((g) => g.role)).toEqual(expect.arrayContaining(['tank', 'healer']));
    const classes = a.suggestions.map((s) => s.wowClass);
    expect(classes).not.toContain('warrior'); // already high
    expect(classes.indexOf('shaman')).toBeLessThan(classes.indexOf('priest')); // listed first
    expect(classes.length).toBeLessThanOrEqual(5);
  });

  it('suggests nothing when there are no tank or healer gaps', () => {
    const a = buildAssessment([], members, []);
    expect(a).toMatchObject({ gaps: [], suggestions: [], raids: 0 });
    expect(assessmentFacts(a)).toMatch(
      /No role gaps in the coming raids\.\nRecruiting now: nothing listed/,
    );
  });
});

describe('renderAssessment', () => {
  const a = buildAssessment([tick([signup('a', 'melee', 'rogue')])], members, [
    { wowClass: 'priest', specs: 'holy', need: 'medium' },
  ]);

  it('uses the facts when there is no wording, with one button per suggestion', () => {
    const message = renderAssessment(a, null);
    expect(message.content).toBe(assessmentFacts(a));
    const row = message.components?.[0] as { components: { custom_id: string }[] } | undefined;
    const ids = (row?.components ?? []).map((c) => c.custom_id);
    expect(ids).toContain(raiseNeedCustomId('priest'));
    expect(parseRaiseNeedCustomId(ids[0]!)).toBe(a.suggestions[0]?.wowClass);
    expect(parseRaiseNeedCustomId('poll:v:1')).toBeNull();
  });

  it('puts the wording in front when there is some, and keeps the buttons', () => {
    const message = renderAssessment(a, 'Healers are thin this week.');
    expect(message.content).toBe('**Weekly roster check**\nHealers are thin this week.');
    expect(message.components).toHaveLength(1);
  });
});
