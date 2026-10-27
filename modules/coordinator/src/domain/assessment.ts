// The weekly roster and recruitment assessment (#130). Deterministic triggers, AI only for
// wording (PLAN §6.2): every Monday from 16:00 UTC the coordinator looks at the comp gaps of the
// coming raids and the site's recruiting needs, works out which classes could fill a tank or
// healer gap, and posts that to the ops channel with one "Raise <class> to high" button each.
// The model may reword the facts; the facts, the suggestions, and the buttons are code.
import type { CompRole } from '@vintage/comp-solver';
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type MessageData,
  TimestampStyle,
  truncate,
} from '@vintage/discord-kit';
import type { ClassNeed } from '@vintage/site/contract';
import type { WowClass } from '@vintage/wow-data';
import type { TickEvent, TickMember } from '../store';
import { compFor } from './render';

/** Classes that can fill each role the assessment suggests for (DPS gaps are left to officers). */
export const ROLE_CLASSES: Partial<Record<CompRole, WowClass[]>> = {
  tank: ['warrior', 'druid', 'paladin'],
  healer: ['priest', 'shaman', 'druid', 'paladin'],
};

/** At most this many raids are looked at, and this many buttons offered (one action row). */
export const ASSESSMENT_RAIDS = 3;
export const MAX_SUGGESTIONS = 5;

const RAISE_PREFIX = 'recruit:hi:';
export const raiseNeedCustomId = (wowClass: WowClass) => `${RAISE_PREFIX}${wowClass}`;
export const parseRaiseNeedCustomId = (customId: string): string | null =>
  customId.startsWith(RAISE_PREFIX) ? customId.slice(RAISE_PREFIX.length) || null : null;

/** This week's Monday 16:00 UTC: the assessment is due from then. */
export function assessmentSlot(now: number): number {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday, 16);
}

/** The week's rule key, `assessment-2026-10-26`, or null before this week's slot. */
export function assessmentRule(now: number): string | null {
  const slot = assessmentSlot(now);
  return now >= slot ? `assessment-${new Date(slot).toISOString().slice(0, 10)}` : null;
}

export interface RoleGap {
  eventId: string;
  raid: string;
  startsAt: number;
  role: CompRole;
  have: number;
  target: number;
}

export interface Suggestion {
  wowClass: WowClass;
  role: CompRole;
  /** The class's need on the site now, or null when it isn't listed. */
  from: ClassNeed['need'] | null;
}

export interface Assessment {
  gaps: RoleGap[];
  suggestions: Suggestion[];
  needs: ClassNeed[];
  raids: number;
}

export function buildAssessment(
  events: readonly TickEvent[],
  members: readonly TickMember[],
  needs: readonly ClassNeed[],
): Assessment {
  const coming = events.slice(0, ASSESSMENT_RAIDS);
  const gaps: RoleGap[] = coming.flatMap((tick) =>
    compFor(tick, [...members]).gaps.flatMap((g) =>
      g.kind === 'role'
        ? [
            {
              eventId: tick.event.id,
              raid: tick.event.name,
              startsAt: tick.event.startsAt,
              role: g.role,
              have: g.have,
              target: g.target,
            },
          ]
        : [],
    ),
  );
  const short = new Set(gaps.map((g) => g.role));
  const suggestions: Suggestion[] = [];
  for (const role of ['tank', 'healer'] as const) {
    if (!short.has(role)) continue;
    const candidates = (ROLE_CLASSES[role] ?? [])
      .map((wowClass) => ({
        wowClass,
        role,
        from: needs.find((n) => n.wowClass === wowClass)?.need ?? null,
      }))
      .filter((s) => s.from !== 'high')
      // Listed classes first (a medium need is one step from high), then unlisted ones.
      .sort((a, b) => Number(a.from === null) - Number(b.from === null));
    for (const s of candidates) {
      if (!suggestions.some((x) => x.wowClass === s.wowClass)) suggestions.push(s);
    }
  }
  return {
    gaps,
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    needs: [...needs],
    raids: coming.length,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_NAME: Record<CompRole, string> = { tank: 'tanks', healer: 'healers', dps: 'DPS' };

/** The facts in plain lines: what the model may reword, and the fallback when it can't. */
export function assessmentFacts(a: Assessment): string {
  const open = a.needs.filter((n) => n.need !== 'closed');
  const lines = [
    `**Weekly roster check** · ${a.raids} upcoming raid${a.raids === 1 ? '' : 's'}`,
    a.gaps.length
      ? `Gaps: ${a.gaps
          .map(
            (g) =>
              `${g.raid} ${discordTimestamp(g.startsAt, TimestampStyle.SHORT_DATE)}: ${ROLE_NAME[g.role]} ${g.have}/${g.target}`,
          )
          .join(' · ')}`
      : 'No role gaps in the coming raids.',
    `Recruiting now: ${
      open.length
        ? open.map((n) => `${cap(n.wowClass)} (${n.specs}) ${n.need}`).join(' · ')
        : 'nothing listed'
    }`,
  ];
  if (a.suggestions.length) {
    lines.push(
      `Suggested: raise ${a.suggestions.map((s) => cap(s.wowClass)).join(', ')} to high for the ${[
        ...new Set(a.suggestions.map((s) => ROLE_NAME[s.role])),
      ].join(' and ')} gap.`,
    );
  }
  return lines.join('\n');
}

export const WORDING_INSTRUCTIONS = [
  "You write the weekly roster note for a World of Warcraft guild's officers.",
  'Rewrite the facts below as three or four short, friendly sentences. Keep every number, raid name, date marker (text like <t:123:d>), and class exactly as given. Add nothing that is not in the facts. No greeting, no sign-off.',
].join('\n');

/** The post: the wording (or the facts), then one button per suggestion. */
export function renderAssessment(a: Assessment, wording: string | null): MessageData {
  const body = wording?.trim() ? `**Weekly roster check**\n${wording.trim()}` : assessmentFacts(a);
  return {
    content: truncate(body, 2000),
    components: a.suggestions.length
      ? [
          actionRow(
            ...a.suggestions.map((s) =>
              button(
                raiseNeedCustomId(s.wowClass),
                `Raise ${cap(s.wowClass)} to high`,
                ButtonStyle.PRIMARY,
              ),
            ),
          ),
        ]
      : [],
    allowed_mentions: { parse: [] },
  };
}
