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
  size: 40,
  startsAt: Date.UTC(2026, 9, 29, 0),
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
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

  it('uses the app emoji map and nothing for unknown names', () => {
    expect(emoji('square_warrior')).toMatch(/^<:square_warrior:\d+>$/);
    expect(emoji('status_going')).toMatch(/^<:status_going:\d+>$/);
    expect(emoji('not_an_emoji')).toBe('');
  });
});
