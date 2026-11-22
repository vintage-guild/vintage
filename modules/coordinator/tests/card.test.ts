import { EMBED_LIMITS, type Embed, type MessageData } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import type { WowClass } from '@vintage/wow-data';
import { describe, expect, it } from 'vitest';
import {
  emoji,
  fitLines,
  renderFinalRoster,
  renderPartyDraft,
  renderPartyPost,
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
  access: 'guild',
  size: 40,
  startsAt: Date.UTC(2026, 9, 29, 0),
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  notes: null,
  rosterApprovedAt: null,
  rosterApprovedBy: null,
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
      alsoRoles: [],
      status,
      lateMinutes: null,
      note: status === 'tentative' ? 'might have to work late tonight' : null,
      signedUpAt: i,
      updatedAt: i,
      updatedBy: null,
      roster: 'pending',
      group: null,
      queued: i >= 40 && i < 45,
      promotedAt: null,
    };
  });
  return { event, timings: DEFAULT_TIMINGS, signups };
}

/** Discord's embed limits: 25 fields, 1024 per field value, 256 per title, 6000 in total, no split emoji. */
function expectWithinLimits(message: MessageData) {
  for (const e of message.embeds ?? []) {
    const fields = e.fields ?? [];
    expect(fields.length).toBeLessThanOrEqual(EMBED_LIMITS.fields);
    for (const f of fields) {
      expect(f.value.trim().length).toBeGreaterThan(0);
      expect(f.value.length).toBeLessThanOrEqual(EMBED_LIMITS.fieldValue);
      // Never slice mid-emoji token like "<:spec_warrior_prot"
      expect(f.value).not.toMatch(/<:[^>]*$/);
    }
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
  it('a 40-person card with long names, late/recruit marks, and absent players stays within Discord limits without leaking tentative reasons', () => {
    const base = fullRaid();
    // Worst-case long first+last names, late minutes, tentative reasons, and absent players.
    const statusFor = (i: number): Signup['status'] => {
      if (i >= 46) return 'tentative';
      if (i >= 40) return 'bench';
      return i % 5 === 0 ? 'late' : 'accepted';
    };
    const signups = [
      ...base.signups.map((s, i) => {
        const status = statusFor(i);
        return {
          ...s,
          characterName: `Thalassian Longsurname${String(i).padStart(2, '0')}`,
          status,
          lateMinutes: status === 'late' ? (15 as const) : null,
          note: status === 'tentative' ? 'might be stuck in traffic after work' : null,
        };
      }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...base.signups[0]!,
        id: `abs${i}`,
        memberId: `am${i}`,
        characterId: `ac${i}`,
        characterName: `Absent Raider${String(i).padStart(2, '0')}`,
        status: 'declined' as const,
        note: 'private reason',
      })),
    ];
    const members = signups.map((s, i) => ({
      memberId: s.memberId,
      discordId: `200000000000000${String(i).padStart(3, '0')}`,
      displayName: s.characterName,
      rank: (i % 4 === 0 ? 'recruit' : 'raider') as 'recruit' | 'raider',
      dmOptOut: false,
    }));
    const message = renderSignupPost({ ...base, signups }, members, {
      siteUrl: 'https://vintage.guild',
    });
    expectWithinLimits(message);
    const fields = (message.embeds![0] as Embed).fields!;
    // 2x2 role columns + 2 inline spacers = 6 inline fields.
    expect(fields.slice(0, 6).every((f) => f.inline === true)).toBe(true);
    expect(fields[0]!.name).toContain('Tanks');
    expect(fields[1]!.name).toContain('Healers');
    expect(fields[3]!.name).toContain('Melee');
    expect(fields[4]!.name).toContain('Ranged');
    // No footer, and tentative/absent reasons never show publicly on the card.
    expect((message.embeds![0] as Embed).footer).toBeUndefined();
    const text = messageText(message);
    expect(text).not.toContain('might be stuck in traffic after work');
    expect(text).not.toContain('private reason');
    // Absent row sits below Missing.
    const missingPos = Math.max(text.indexOf('**Missing**'), text.indexOf('**Comp**'));
    const absentPos = text.indexOf('**Absent**');
    expect(missingPos).toBeGreaterThan(-1);
    expect(absentPos).toBeGreaterThan(missingPos);
    expect(buttonLabels(message)).toContain('Absent');
    expect(buttonLabels(message)).toContain('Raid page');
  });

  it('packs Tentative, Missing, and Absent into one compact field below the columns without blank gaps or reasons', () => {
    const raid = fullRaid();
    const going = raid.signups[0]!;
    const declined: Signup = {
      ...raid.signups[1]!,
      characterName: 'Gore Khan',
      status: 'declined',
      note: 'family dinner',
    };
    const tentative: Signup = {
      ...raid.signups[2]!,
      characterName: 'Plate Licker',
      status: 'tentative',
      note: 'might have plans with my wife',
    };
    const message = renderSignupPost(
      {
        ...raid,
        signups: [going, declined, tentative],
        away: [
          { memberId: 'm-away', displayName: 'Cade', reason: 'work trip', summary: 'Oct 28–30' },
        ],
      },
      [],
    );
    const fields = (message.embeds![0] as Embed).fields!;
    // 6 inline role/spacer fields + 1 compact footer field (no blank gaps between lines).
    expect(fields).toHaveLength(7);
    const footerLines = fields[6]!.value.split('\n');
    expect(footerLines.every((l) => l.trim().length > 0)).toBe(true);
    expect(footerLines[0]).toContain('**Tentative**');
    expect(footerLines[0]).toContain('Plate Licker');
    expect(footerLines[1]).toContain('**Missing**');
    expect(footerLines.at(-1)).toContain('**Absent** Cade · Gore Khan');
    const text = messageText(message);
    expect(text).not.toContain('might have plans with my wife');
    expect(text).not.toContain('family dinner');
    expect(text).not.toContain('work trip');
  });

  it('fitLines packs whole lines within the budget and never splits tokens', () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `<:spec_mage_frost:1564133153134739537> LongName${i}`,
    );
    const fitted = fitLines(lines, 200);
    expect(fitted.text.length).toBeLessThanOrEqual(200);
    expect(fitted.hidden).toBeGreaterThan(0);
    expect(fitted.text).toMatch(/\+\d+ more…$/);
    expect(fitted.text).not.toMatch(/<:[^>]*$/);
  });

  it('offers Roster only when the card overflows and leaves someone out', () => {
    const raid = fullRaid();
    const hasRoster = (signups: typeof raid.signups) =>
      buttonLabels(renderSignupPost({ ...raid, signups }, [])).includes('Roster');
    // A handful going, all shown: no Roster.
    const few = raid.signups
      .slice(0, 3)
      .map((s) => ({ ...s, status: 'accepted' as const, queued: false }));
    expect(hasRoster(few)).toBe(false);
    // One absent fits on the Absent line below Missing, so Roster isn't needed.
    expect(hasRoster([...few, { ...few[0]!, id: 'd1', status: 'declined' as const }])).toBe(false);
    // Overflowing tentative list triggers Roster.
    const manyTentative = Array.from({ length: 30 }, (_, i) => ({
      ...few[0]!,
      id: `t${i}`,
      characterName: `VeryLongTentativeName${i}`,
      status: 'tentative' as const,
      note: 'might have to work late tonight',
    }));
    expect(hasRoster([...few, ...manyTentative])).toBe(true);
    // Overflowing absent list triggers Roster.
    const manyAbsent = Array.from({ length: 60 }, (_, i) => ({
      ...few[0]!,
      id: `a${i}`,
      characterName: `VeryLongAbsentName${String(i).padStart(2, '0')}`,
      status: 'declined' as const,
    }));
    expect(hasRoster([...few, ...manyAbsent])).toBe(true);
  });

  it('the Roster reply lists everyone without leaking tentative reasons and stays inside the limits', () => {
    const raid = fullRaid();
    const message = renderRosterReply(raid.event, raid.signups);
    expectWithinLimits(message);
    const text = messageText(message);
    for (let i = 0; i < 52; i++) {
      expect(text).toContain(`Longnamechar${String(i).padStart(2, '0')}`);
    }
    expect(text).not.toContain('might have to work late tonight');
  });

  it('the final roster stays inside the limits and sends no empty Standby field', () => {
    const raid = fullRaid();
    expectWithinLimits(renderFinalRoster(raid, []));
    const few = raid.signups
      .slice(0, 3)
      .map((s) => ({ ...s, status: 'accepted' as const, queued: false }));
    const message = renderFinalRoster({ ...raid, signups: few }, []);
    expectWithinLimits(message);
    const standby = (message.embeds![0] as Embed).fields!.find((f) => f.name === 'Standby');
    expect(standby?.value).toBe('—');
  });

  it('renders party draft and approved party post within Discord limits', () => {
    const raid = fullRaid();
    const draft = renderPartyDraft(raid, [], { siteUrl: 'https://vintage.guild' });
    expectWithinLimits(draft);
    expect(buttonLabels(draft)).toEqual(['Approve and post', 'Redraft', 'Edit in the quarters']);
    const partyPost = renderPartyPost(raid, [], { locked: true });
    expectWithinLimits(partyPost);
    expect((partyPost.embeds![0] as Embed).title).toContain('Final roster');
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
    alsoRoles: [],
    status: 'accepted',
    lateMinutes: null,
    note: null,
    signedUpAt: i,
    updatedAt: i,
    updatedBy: null,
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
    expect(
      [card.fields![0]!, card.fields![1]!, card.fields![3]!, card.fields![4]!].map((f) =>
        plain(f.name),
      ),
    ).toEqual(['Tanks 1/1', 'Healers 0/1', 'Melee 0', 'Ranged 0']);
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
