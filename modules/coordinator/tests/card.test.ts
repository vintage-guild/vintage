import { EMBED_LIMITS, type Embed, type MessageData } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import type { WowClass } from '@vintage/wow-data';
import { describe, expect, it } from 'vitest';
import {
  COLUMN_CAP,
  emoji,
  renderFinalRoster,
  renderRosterReply,
  renderSignupPost,
} from '../src/domain/card';
import type { TickEvent } from '../src/store';
import { buttonLabels, messageText } from '../src/testing';

const event: RaidEvent = {
  id: 'raid-1',
  guildId: 'g',
  scheduleId: null,
  name: 'Raid night',
  instance: 'Molten Core',
  kind: 'raid',
  size: 40,
  startsAt: Date.UTC(2026, 9, 29, 0),
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  notes: null,
  configVersion: 1,
};

const ROTATION: [WowClass, string, Signup['role']][] = [
  ['warrior', 'protection', 'tank'],
  ['priest', 'holy', 'healer'],
  ['mage', 'frost', 'ranged'],
  ['rogue', 'combat', 'melee'],
  ['druid', 'feral-tank', 'tank'],
  ['shaman', 'restoration', 'healer'],
  ['warlock', 'destruction', 'ranged'],
  ['hunter', 'marksmanship', 'ranged'],
];

/** A worst case: 45 going (5 queued), standby and tentative with long names and notes. */
function fullRaid(): TickEvent {
  const signups: Signup[] = Array.from({ length: 52 }, (_, i) => {
    const [cls, spec, role] = ROTATION[i % ROTATION.length]!;
    const status: Signup['status'] = i < 45 ? 'accepted' : i < 49 ? 'bench' : 'tentative';
    return {
      id: `s${i}`,
      guildId: 'g',
      eventId: event.id,
      memberId: `m${i}`,
      characterId: `c${i}`,
      characterName: `Longnamechar${String(i).padStart(2, '0')}`,
      class: cls,
      spec,
      role,
      status,
      note: status === 'tentative' ? 'might have to work late tonight' : null,
      signedUpAt: i,
      updatedAt: i,
      roster: 'pending',
      group: null,
      queued: i >= 40 && i < 45,
      promotedAt: null,
    };
  });
  return { event, timings: DEFAULT_TIMINGS, signups };
}

/** Discord's embed limits: 25 fields, 1024 per field value, 256 per title, 6000 in total. */
function expectWithinLimits(message: MessageData) {
  for (const e of message.embeds ?? []) {
    const fields = e.fields ?? [];
    expect(fields.length).toBeLessThanOrEqual(EMBED_LIMITS.fields);
    for (const f of fields) expect(f.value.length).toBeLessThanOrEqual(EMBED_LIMITS.fieldValue);
    expect((e.title ?? '').length).toBeLessThanOrEqual(EMBED_LIMITS.title);
    const total =
      (e.title ?? '').length +
      (e.description ?? '').length +
      (e.footer?.text ?? '').length +
      fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
  }
}

describe('raid cards', () => {
  it('a full 40-person card stays inside Discord limits and keeps its height', () => {
    const message = renderSignupPost(fullRaid(), []);
    expectWithinLimits(message);
    const [tanks, healers, dps] = (message.embeds![0] as Embed).fields!;
    // Three columns, each capped, so the card height doesn't grow with the raid.
    for (const column of [tanks, healers, dps]) {
      expect(column!.inline).toBe(true);
      expect(column!.value.split('\n').length).toBeLessThanOrEqual(COLUMN_CAP + 1);
    }
    expect(dps!.value).toMatch(/\+\d+ more…$/);
    expect(buttonLabels(message)).toEqual([
      'Accept',
      'Late',
      'Tentative',
      'Standby',
      'Decline',
      'Roster',
    ]);
  });

  it('the Roster reply lists everyone and stays inside the limits', () => {
    const raid = fullRaid();
    const message = renderRosterReply(raid.event, raid.signups);
    expectWithinLimits(message);
    for (let i = 0; i < 52; i++) {
      expect(messageText(message)).toContain(`Longnamechar${String(i).padStart(2, '0')}`);
    }
  });

  it('the final roster stays inside the limits too', () => {
    expectWithinLimits(renderFinalRoster(fullRaid(), []));
  });

  it("quotes the raid's notes under the lock line, a block per paragraph, within the limits", () => {
    const plain = renderSignupPost({ event, timings: DEFAULT_TIMINGS, signups: [] }, []);
    expect((plain.embeds![0] as Embed).description).not.toMatch(/^> /m);
    const notes = 'Fire resist and flasks.\nBring a fire pot.\n\nOn at 7:45 for buffs.';
    const noted = renderSignupPost(
      { event: { ...event, notes }, timings: DEFAULT_TIMINGS, signups: [] },
      [],
    );
    const lines = (noted.embeds![0] as Embed).description!.split('\n');
    const at = lines.findIndex((l) => l.startsWith('-# '));
    expect(lines.slice(at + 1, at + 6)).toEqual([
      '',
      '> Fire resist and flasks.',
      '> Bring a fire pot.',
      '',
      '> On at 7:45 for buffs.',
    ]);
    // The longest notes on the fullest card still fit.
    const raid = fullRaid();
    expectWithinLimits(
      renderSignupPost({ ...raid, event: { ...event, notes: 'x'.repeat(500) } }, []),
    );
  });

  it('uses the app emoji map and nothing for unknown names', () => {
    expect(emoji('square_warrior')).toMatch(/^<:square_warrior:\d+>$/);
    expect(emoji('status_going')).toMatch(/^<:status_going:\d+>$/);
    expect(emoji('not_an_emoji')).toBe('');
  });
});

describe('event kinds on the card', () => {
  const signup = (i: number, cls: WowClass, spec: string, role: Signup['role']): Signup => ({
    id: `k${i}`,
    guildId: 'g',
    eventId: 'ev-k',
    memberId: `km${i}`,
    characterId: `kc${i}`,
    characterName: `Char${i}`,
    class: cls,
    spec,
    role,
    status: 'accepted',
    note: null,
    signedUpAt: i,
    updatedAt: i,
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
  });
  const tickFor = (overrides: Partial<RaidEvent>, signups: Signup[]): TickEvent => ({
    event: { ...event, id: 'ev-k', ...overrides },
    timings: DEFAULT_TIMINGS,
    signups,
  });
  const plain = (name: string) => name.replace(/<:[^>]+>\s*/g, '');

  it('a dungeon shows its 1/1/3 targets and missing roles, and no buffs', () => {
    const tick = tickFor(
      { kind: 'dungeon', size: 5, name: 'Cathedral run', instance: 'Scarlet Monastery' },
      [signup(1, 'warrior', 'protection', 'tank')],
    );
    const message = renderSignupPost(tick, []);
    const card = message.embeds![0] as Embed;
    expect(card.title).toBe('Dungeon · Cathedral run · Scarlet Monastery');
    expect(card.description).toContain('5-person dungeon');
    expect(card.fields!.slice(0, 3).map((f) => plain(f.name))).toEqual([
      'Tanks 1/1',
      'Healers 0/1',
      'DPS 0/3',
    ]);
    const text = messageText(message);
    expect(text).toContain('**Missing** 1 healer · 3 dps');
    expect(text).not.toMatch(/MotW|Fort\b/);
  });

  it('a raid still lists missing buffs and keeps its own title', () => {
    const tick = tickFor({ size: 10 }, [signup(1, 'warrior', 'protection', 'tank')]);
    const message = renderSignupPost(tick, []);
    expect(messageText(message)).toMatch(/\*\*Missing\*\* .*MotW/);
    expect((message.embeds![0] as Embed).title).toBe('Raid night · Molten Core');
  });

  it('an "other" event with no role targets lists everyone in one column', () => {
    const tick = tickFor({ kind: 'other', size: 8, name: 'Fishing', instance: 'Stranglethorn' }, [
      signup(1, 'warrior', 'protection', 'tank'),
      signup(2, 'mage', 'frost', 'ranged'),
    ]);
    const card = renderSignupPost(tick, []).embeds![0] as Embed;
    expect(card.title).toBe('Event · Fishing · Stranglethorn');
    expect(card.fields![0]!.name).toBe('Going 2/8');
    expect(card.fields!.some((f) => f.name.includes('Tanks'))).toBe(false);
  });

  it('an open "other" event with no instance shows just its name and a bare count', () => {
    const tick = tickFor({ kind: 'other', size: null, name: 'Westfall levelling', instance: '' }, [
      signup(1, 'warrior', 'protection', 'tank'),
      signup(2, 'mage', 'frost', 'ranged'),
      signup(3, 'rogue', 'combat', 'melee'),
    ]);
    const message = renderSignupPost(tick, []);
    const card = message.embeds![0] as Embed;
    expect(card.title).toBe('Event · Westfall levelling');
    expect(card.description).toContain('open event');
    expect(card.fields![0]!.name).toBe('Going 3');
    // No cap: nobody short, nothing missing.
    expect(messageText(message)).toContain('**Comp** no gaps');
    expect(messageText(message)).not.toMatch(/null|undefined/);
    const final = renderFinalRoster(tick, []).embeds![0] as Embed;
    expect(final.description).toMatch(/Signups locked · 3$/);
  });

  it('an "other" event with role targets keeps the columns', () => {
    const tick = tickFor({ kind: 'other', size: 8, roleTargets: { tank: 1, healer: 2, dps: 5 } }, [
      signup(1, 'warrior', 'protection', 'tank'),
    ]);
    const card = renderSignupPost(tick, []).embeds![0] as Embed;
    expect(plain(card.fields![0]!.name)).toBe('Tanks 1/1');
  });
});
