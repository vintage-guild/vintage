// Discord messages the coordinator sends. Pure: data in, discord-kit MessageData out. Times use
// Discord timestamp markup so everyone sees their own local time (PLAN §6.2).
import { encodeBridge } from '@vintage/bridge-format';
import { type CompResult, compRoleOf, defaultTemplate, solveComp } from '@vintage/comp-solver';
import { discordTimestamp, type MessageData, TimestampStyle } from '@vintage/discord-kit';
import { RANK_PRIORITY, type Signup } from '@vintage/raids/contract';
import type { TickEvent, TickMember } from '../store';

/** Discord's message content limit. */
const MAX_CONTENT = 2000;

const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(ms, TimestampStyle.RELATIVE)})`;

const mention = (m: TickMember) => `<@${m.discordId}>`;

const GOING = new Set(['accepted', 'late']);

/** Going and inside the raid size (not waiting in the queue). */
const inRaid = (s: Signup) => GOING.has(s.status) && !s.queued;

type CompRoleName = 'tank' | 'healer' | 'dps';

/** "Tanks 4 · Healers 9 · DPS 25": who's in, per role. */
export function roleCounters(signups: Signup[]): string {
  const n = (role: CompRoleName) =>
    signups.filter((s) => inRaid(s) && compRoleOf(s.role) === role).length;
  return `Tanks ${n('tank')} · Healers ${n('healer')} · DPS ${n('dps')}`;
}

/** The comp for a raid's signups, ranked like comp-suggest. */
export function compFor(tick: TickEvent, members: TickMember[]): CompResult {
  const rank = new Map(members.map((m) => [m.memberId, m.rank]));
  const template = tick.event.roleTargets
    ? { ...defaultTemplate(tick.event.size), targets: tick.event.roleTargets }
    : defaultTemplate(tick.event.size);
  return solveComp({
    raidSize: tick.event.size,
    template,
    signups: tick.signups.map((s) => {
      const r = rank.get(s.memberId);
      return {
        id: s.id,
        name: s.characterName,
        class: s.class,
        spec: s.spec,
        role: s.role,
        // Queued people only play if nobody ahead of them fits.
        status: s.queued ? 'bench' : s.status,
        priority: r ? RANK_PRIORITY[r] : 0,
        signedUpAt: s.signedUpAt,
      };
    }),
  });
}

const gapLine = (comp: CompResult) =>
  comp.gaps.length ? comp.gaps.map((g) => g.reason).join(' · ') : 'No gaps';

/** Stable hash of what the post would show, so it's edited only when it changes. */
export function hashMessage(message: MessageData): string {
  const text = JSON.stringify(message);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Channel reminder that pings only the people who haven't answered. */
export function renderReminder(tick: TickEvent, waiting: TickMember[]): MessageData {
  const names = waiting.map(mention).join(' ');
  const content = `**${tick.event.name}** starts ${when(tick.event.startsAt)}. Still waiting on: ${names}\nAnswer on the signup post above.`;
  return {
    content: content.slice(0, MAX_CONTENT),
    allowed_mentions: { users: waiting.map((m) => m.discordId) },
  };
}

/** Tells someone from the queue that a spot opened and they're in. */
export function renderPromotion(
  tick: TickEvent,
  signup: Signup,
  member: TickMember | undefined,
): MessageData {
  const who = member ? `<@${member.discordId}>` : `**${signup.characterName}**`;
  return {
    content:
      `${who} a spot opened up: ${signup.characterName} is in for **${tick.event.name}** ` +
      `${when(tick.event.startsAt)}. Can't make it after all? Change your answer on the signup post.`,
    allowed_mentions: { users: member ? [member.discordId] : [] },
  };
}

export function renderDm(tick: TickEvent, member: TickMember): MessageData {
  return {
    content:
      `Hi ${member.displayName}, **${tick.event.name}** starts ${when(tick.event.startsAt)} and you ` +
      "haven't answered yet. Use the buttons on the signup post in the raid signups channel. " +
      'You can turn these DMs off in your profile on the guild site.',
    allowed_mentions: { parse: [] },
  };
}

/** Officer digest: confirmed count, comp gaps, and who hasn't answered. */
export function renderDigest(
  tick: TickEvent,
  members: TickMember[],
  waiting: TickMember[],
): MessageData {
  const comp = compFor(tick, members);
  const waitingLine = waiting.length
    ? `Not answered (${waiting.length}): ${waiting.map((m) => m.displayName).join(', ')}`
    : 'Everyone expected has answered.';
  const withReasons = (status: Signup['status'], title: string) => {
    const people = tick.signups.filter((s) => s.status === status);
    if (!people.length) return null;
    const names = people.map((s) => (s.note ? `${s.characterName} (${s.note})` : s.characterName));
    return `${title} (${people.length}): ${names.join(', ')}`;
  };
  const queued = tick.signups.filter((s) => s.queued).length;
  return {
    content: [
      `**${tick.event.name}** ${when(tick.event.startsAt)}`,
      `${comp.counts.confirmed}/${tick.event.size} confirmed · ${roleCounters(tick.signups)}` +
        `${queued ? ` · ${queued} queued` : ''}`,
      gapLine(comp),
      withReasons('late', 'Late'),
      withReasons('tentative', 'Tentative'),
      withReasons('bench', 'Bench'),
      waitingLine,
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
      .slice(0, MAX_CONTENT),
    allowed_mentions: { parse: [] },
  };
}

/**
 * Who's in: the leader's roster when they set one (rostered signups), otherwise the comp
 * solver's pick from the signups.
 */
export function finalRoster(
  tick: TickEvent,
  members: TickMember[],
): { going: Signup[]; bench: Signup[] } {
  const rostered = tick.signups.filter((s) => s.roster === 'rostered');
  if (rostered.length) {
    return { going: rostered, bench: tick.signups.filter((s) => s.roster === 'benched') };
  }
  const comp = compFor(tick, members);
  const byId = new Map(tick.signups.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is Signup => !!s);
  return {
    going: pick(comp.selected.map((d) => d.signup.id)),
    bench: pick(comp.bench.map((d) => d.signup.id)),
  };
}

/**
 * The addon import string (libs/bridge-format) for a raid: who goes by the comp, with their
 * groups. Shared by the officer-channel post and `addon-import-get`, so both give the same string.
 */
export function buildImportString(
  tick: TickEvent,
  members: TickMember[],
  guildId: string,
  now: number,
): { characters: number; encoded: ReturnType<typeof encodeBridge> } {
  const { going } = finalRoster(tick, members);
  const groups = new Map<number, string[]>();
  for (const s of going) {
    if (s.group !== null) groups.set(s.group, [...(groups.get(s.group) ?? []), s.characterId]);
  }
  const encoded = encodeBridge({
    v: 1,
    kind: 'raid-import',
    guildId,
    generatedAt: Math.floor(now / 1000),
    raid: {
      eventId: tick.event.id,
      title: tick.event.name,
      startsAt: Math.floor(tick.event.startsAt / 1000),
    },
    roster: going.map((s) => ({
      characterId: s.characterId,
      name: s.characterName,
      class: s.class,
      spec: s.spec,
      role: s.role,
    })),
    groups: [...groups].map(([group, characterIds]) => ({ group, characterIds })),
    // Loot methods arrive with the loot module (Phase 2); until then the addon leaves loot alone.
    loot: {
      methodId: tick.event.lootMethodId ?? 'unset',
      methodVersion: 1,
      configVersion: tick.event.configVersion,
      mode: 'group',
    },
    candidates: [],
  });
  return { characters: going.length, encoded };
}

/** The addon import string as the officer-channel message. */
export function renderImportString(
  tick: TickEvent,
  members: TickMember[],
  guildId: string,
  now: number,
): MessageData {
  const { characters, encoded } = buildImportString(tick, members, guildId, now);
  const header = `Addon import for **${tick.event.name}** (${characters} characters). Paste it into the Vintage addon:`;
  if (!encoded.ok) {
    return {
      content: `${header}\nCould not build it: ${encoded.error.message}`,
      allowed_mentions: { parse: [] },
    };
  }
  const content = `${header}\n\`\`\`\n${encoded.value}\n\`\`\``;
  return {
    content:
      content.length <= MAX_CONTENT
        ? content
        : `${header}\nIt is too long for one message (${encoded.value.length} characters); use the website export.`,
    allowed_mentions: { parse: [] },
  };
}

export function renderFailure(tick: TickEvent, rule: string, error: string): MessageData {
  return {
    content:
      `Coordinator could not do \`${rule}\` for **${tick.event.name}** (${when(tick.event.startsAt)}): ${error}`.slice(
        0,
        MAX_CONTENT,
      ),
    allowed_mentions: { parse: [] },
  };
}
