import {
  countComponents,
  LAYOUT_LIMITS,
  type LayoutComponent,
  layoutText,
  MessageFlags,
} from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import type { WowClass } from '@vintage/wow-data';
import { describe, expect, it } from 'vitest';
import { emoji, renderFinalRoster, renderSignupPost } from '../src/domain/card';
import type { TickEvent } from '../src/store';

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

/** A worst case: 45 people going (5 queued) plus standby and tentative, all with long names. */
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

describe('raid cards (Components V2)', () => {
  it('a full 40-person card stays inside Discord limits', () => {
    const message = renderSignupPost(fullRaid(), []);
    const components = message.components as LayoutComponent[];
    expect(message.flags).toBe(MessageFlags.IS_COMPONENTS_V2);
    expect(message.content).toBeUndefined();
    expect(message.embeds).toBeUndefined();
    expect(countComponents(components)).toBeLessThanOrEqual(LAYOUT_LIMITS.components);
    expect(layoutText(components).length).toBeLessThanOrEqual(LAYOUT_LIMITS.text);
  });

  it('the final roster stays inside the limits too', () => {
    const components = renderFinalRoster(fullRaid(), []).components as LayoutComponent[];
    expect(countComponents(components)).toBeLessThanOrEqual(LAYOUT_LIMITS.components);
    expect(layoutText(components).length).toBeLessThanOrEqual(LAYOUT_LIMITS.text);
  });

  it('uses the app emoji map, with a class icon fallback and nothing for unknown names', () => {
    expect(emoji('class_warrior')).toMatch(/^<:class_warrior:\d+>$/);
    expect(emoji('not_an_emoji')).toBe('');
  });
});
