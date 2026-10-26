// The coordinator's raid cards as Discord Components V2 messages: one container with an accent
// stripe, text sections with class and spec icons (the app's own emoji), and the answer buttons.
// Pure: data in, MessageData out. Layout ideas from Raid-Helper (docs/research/raid-helper.md).
import { compRoleOf, defaultTemplate } from '@vintage/comp-solver';
import { discordColor } from '@vintage/design-tokens';
import {
  actionRow,
  ButtonStyle,
  button,
  type ContainerChild,
  container,
  discordTimestamp,
  type MessageData,
  MessageFlags,
  separator,
  TimestampStyle,
  textDisplay,
} from '@vintage/discord-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import type { TickEvent, TickMember } from '../store';
import { EMOJI_IDS } from './emoji-ids';
import { compFor, finalRoster } from './render';

type CompRoleName = 'tank' | 'healer' | 'dps';

const GOING = new Set(['accepted', 'late']);
const inRaid = (s: Signup) => GOING.has(s.status) && !s.queued;

/** `<:name:id>` for one of the app's emoji, or '' when it isn't uploaded. */
export function emoji(name: string): string {
  const id = EMOJI_IDS[name];
  return id ? `<:${name}:${id}>` : '';
}

/** The spec icon, falling back to the class icon. */
const specIcon = (s: Signup) =>
  emoji(`spec_${s.class}_${s.spec.replaceAll('-', '_')}`) || emoji(`class_${s.class}`);

/** "<icon> Name", marked late, e.g. "<:spec_priest_holy:…> Bramble (late)". */
const person = (s: Signup) =>
  `${specIcon(s)} ${s.characterName}${s.status === 'late' ? ' *(late)*' : ''}`.trim();

const people = (signups: Signup[]) => (signups.length ? signups.map(person).join(' · ') : '—');

const ROLE_HEADER: Record<CompRoleName, { icon: string; label: string }> = {
  tank: { icon: 'role_tank', label: 'Tanks' },
  healer: { icon: 'role_healer', label: 'Healers' },
  dps: { icon: 'role_melee', label: 'DPS' },
};

const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(ms, TimestampStyle.RELATIVE)})`;

/** Gold while open, grey once locked or done. */
function accent(event: RaidEvent): number {
  return event.status === 'open'
    ? discordColor('color.accent.secondary')
    : discordColor('color.border.strong');
}

const targetsFor = (event: RaidEvent) => event.roleTargets ?? defaultTemplate(event.size).targets;

/** "**12** going · **2** late · …" — counts only, no icons (WoW has none that fit). */
function statusLine(signups: Signup[]): string {
  const count = (pred: (s: Signup) => boolean) => signups.filter(pred).length;
  const parts = [
    `**${count((s) => s.status === 'accepted' && !s.queued)}** going`,
    `**${count((s) => s.status === 'late' && !s.queued)}** late`,
    `**${count((s) => s.status === 'tentative')}** tentative`,
    `**${count((s) => s.status === 'bench')}** standby`,
    `**${count((s) => s.status === 'declined')}** out`,
  ];
  const queued = count((s) => s.queued);
  if (queued) parts.push(`**${queued}** queued`);
  return parts.join(' · ');
}

/** Reasons people gave, as one small line: "Late: Bramble (after work) · Tentative: Pip (maybe)". */
function reasonLine(signups: Signup[]): string | null {
  const groups: [Signup['status'], string][] = [
    ['late', 'Late'],
    ['tentative', 'Tentative'],
    ['bench', 'Standby'],
  ];
  const parts = groups
    .map(([status, title]) => {
      const withNote = signups.filter((s) => s.status === status && s.note);
      return withNote.length
        ? `${title}: ${withNote.map((s) => `${s.characterName} (${s.note})`).join(', ')}`
        : null;
    })
    .filter((p): p is string => p !== null);
  return parts.length ? `-# ${parts.join(' · ')}` : null;
}

const SIGNUP_BUTTONS = [
  ['accepted', 'Accept', ButtonStyle.SUCCESS],
  ['late', 'Late', ButtonStyle.PRIMARY],
  ['tentative', 'Tentative', ButtonStyle.SECONDARY],
  ['bench', 'Standby', ButtonStyle.SECONDARY],
  ['declined', 'Decline', ButtonStyle.DANGER],
] as const;

/**
 * The signup post: title and time, status counts, who's in per role against the comp targets
 * (with spec icons), the queue when full, standby and tentative, what the comp is missing, the
 * reasons people gave, and the answer buttons. Edited in place as signups change.
 */
export function renderSignupPost(tick: TickEvent, members: TickMember[]): MessageData {
  const { event, signups } = tick;
  const locked = event.status === 'locked';
  const targets = targetsFor(event);
  const going = signups.filter(inRaid);
  const queue = signups.filter((s) => s.queued).sort((a, b) => a.signedUpAt - b.signedUpAt);
  const standby = signups.filter((s) => s.status === 'bench');
  const maybe = signups.filter((s) => s.status === 'tentative');
  const comp = compFor(tick, members);

  const roleBlock = (role: CompRoleName) => {
    const inRole = going.filter((s) => compRoleOf(s.role) === role);
    const { icon, label } = ROLE_HEADER[role];
    return textDisplay(
      `${emoji(icon)} **${label} ${inRole.length}/${targets[role]}**\n${people(inRole)}`,
    );
  };

  const children: ContainerChild[] = [
    textDisplay(
      `## ${event.name} — ${event.instance}\n${when(event.startsAt)} · ${event.size}-person · ` +
        `signups ${locked ? '**locked**' : 'open'}`,
    ),
    textDisplay(statusLine(signups)),
    separator(),
    roleBlock('tank'),
    roleBlock('healer'),
    roleBlock('dps'),
  ];
  if (queue.length) {
    children.push(
      textDisplay(`**Queue**\n${queue.map((s, i) => `${i + 1}. ${person(s)}`).join(' · ')}`),
    );
  }
  if (standby.length || maybe.length) {
    const lines = [
      standby.length ? `**Standby** ${people(standby)}` : null,
      maybe.length ? `**Tentative** ${people(maybe)}` : null,
    ].filter(Boolean);
    children.push(textDisplay(lines.join('\n')));
  }
  children.push(separator());
  children.push(
    textDisplay(
      comp.gaps.length
        ? `**Missing** ${comp.gaps.map((g) => g.reason.replace(/^need /, '')).join(' · ')}`
        : '**Comp** no gaps',
    ),
  );
  const reasons = reasonLine(signups);
  if (reasons) children.push(textDisplay(reasons));
  children.push(
    actionRow(
      ...SIGNUP_BUTTONS.map(([status, text, style]) =>
        button(`signup:${event.id}:${status}`, text, style, { disabled: locked }),
      ),
    ),
  );

  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container({ accentColor: accent(event) }, ...children)],
    allowed_mentions: { parse: [] },
  };
}

/** The final roster at lock: who's in per role with spec icons, then who sits. */
export function renderFinalRoster(tick: TickEvent, members: TickMember[]): MessageData {
  const { going, bench } = finalRoster(tick, members);
  const byRole = (role: CompRoleName) => going.filter((s) => compRoleOf(s.role) === role);
  const block = (role: CompRoleName) => {
    const { icon, label } = ROLE_HEADER[role];
    const inRole = byRole(role);
    return textDisplay(`${emoji(icon)} **${label} (${inRole.length})**\n${people(inRole)}`);
  };
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        { accentColor: discordColor('color.border.strong') },
        textDisplay(
          `## Final roster — ${tick.event.name}\n${when(tick.event.startsAt)} · signups locked · ` +
            `${going.length}/${tick.event.size}`,
        ),
        separator(),
        block('tank'),
        block('healer'),
        block('dps'),
        separator(),
        textDisplay(`**Benched** ${people(bench)}`),
      ),
    ],
    allowed_mentions: { parse: [] },
  };
}
