// Raid-leader buttons posted in `#leads` (signup-improvements §1a & §4, J61, J64):
//   button  party-approve:<eventId>                        → approve drafted parties and post
//   button  party-redraft:<eventId>                        → clear manual groups and redraft
//   button  seat:<eventId>:<signupId>:<role>:<group>       → seat a Standby player into a dropout's
//                                                            group (switching role if via alsoRoles)
//                                                            and mention them once in the signup channel
// Pure over ports, so Convex (`convex/discord.ts`) and tests run the same flow.
import { signupChannelFor } from '@vintage/coordinator/commands';
import type { CoordinatorConfig } from '@vintage/coordinator/contract';
import {
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  reply,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { ROLES, type Role } from '@vintage/wow-data';

const GROUP_SIZE = 5;
const NEEDS_LEADER = 'That needs the Raid Leader rank.';

const ROLE_LABEL: Record<Role, string> = {
  tank: 'tank',
  healer: 'healer',
  melee: 'melee',
  ranged: 'ranged',
};

export interface LeadsPorts {
  discordGuildId: string | undefined;
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  memberById(memberId: string): Promise<Member | null>;
  event(eventId: string): Promise<RaidEvent | null>;
  signups(eventId: string): Promise<Signup[]>;
  config(): Promise<CoordinatorConfig>;
  /** Run a command through the registry as the leader who clicked. */
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
  /** Clear manual group assignments on a raid so the draft lays them out cleanly. */
  clearGroups(eventId: string): Promise<void>;
  /** Post the one-time mention to the raid's signup channel when a Standby player is seated. */
  postMention(channelId: string, content: string, discordUserId: string): Promise<void>;
  /** Schedule a coordinator tick so cards, drafts, and `#leads` update. */
  afterChange(): Promise<void>;
}

type Parsed =
  | { kind: 'approve'; eventId: string }
  | { kind: 'redraft'; eventId: string }
  | { kind: 'seat'; eventId: string; signupId: string; role: Role; group: number };

const isToken = (s: string | undefined): s is string => !!s && /^[A-Za-z0-9_-]{1,64}$/.test(s);
const isRole = (s: string | undefined): s is Role =>
  !!s && (ROLES as readonly string[]).includes(s);

export function parseLeadsInteraction(interaction: Interaction): Parsed | null {
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return null;
  const parts = (interaction.data?.custom_id ?? '').split(':');
  const [prefix, eventId] = parts;
  if (!isToken(eventId)) return null;
  if (prefix === 'party-approve' && parts.length === 2) return { kind: 'approve', eventId };
  if (prefix === 'party-redraft' && parts.length === 2) return { kind: 'redraft', eventId };
  if (prefix === 'seat' && parts.length === 5) {
    const [, , signupId, role, rawGroup] = parts;
    const group = Number(rawGroup);
    if (!isToken(signupId) || !isRole(role) || !Number.isInteger(group) || group < 0 || group > 8) {
      return null;
    }
    return { kind: 'seat', eventId, signupId, role, group };
  }
  return null;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

function pickTargetGroup(
  requested: number,
  event: RaidEvent,
  signups: readonly Signup[],
): { group: number } | { full: true; takenBy: string | null } {
  const maxGroups = Math.ceil((event.size ?? 40) / GROUP_SIZE);
  const seated = signups.filter((s) => s.roster === 'rostered' && s.group !== null);
  const countIn = (g: number) => seated.filter((s) => s.group === g);

  if (requested >= 1 && requested <= maxGroups) {
    const inGroup = countIn(requested);
    if (inGroup.length < GROUP_SIZE) return { group: requested };
    const latest = [...inGroup].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return { full: true, takenBy: latest?.characterName ?? null };
  }
  for (let g = 1; g <= maxGroups; g++) {
    if (countIn(g).length < GROUP_SIZE) return { group: g };
  }
  return { full: true, takenBy: null };
}

async function handleApprove(
  ports: LeadsPorts,
  caller: Caller,
  event: RaidEvent,
): Promise<InteractionResponse> {
  const result = await ports.run(caller, 'roster-approve', { eventId: event.id });
  if (!result.success) {
    return ephemeral(result.error?.message ?? 'Could not approve parties.');
  }
  await ports.afterChange();
  return ephemeral(
    `Approved parties for **${event.name}**. Posting to the signup channel shortly.`,
  );
}

async function handleRedraft(ports: LeadsPorts, event: RaidEvent): Promise<InteractionResponse> {
  if (event.rosterApprovedAt !== null) {
    return ephemeral(`Parties for **${event.name}** are already approved.`);
  }
  await ports.clearGroups(event.id);
  await ports.afterChange();
  return ephemeral(`Redrafted parties for **${event.name}**. The draft updates in a few seconds.`);
}

function validateSeatTarget(
  target: Signup | undefined,
  requestedGroup: number,
  event: RaidEvent,
  signups: readonly Signup[],
): { target: Signup; group: number } | { error: string } {
  if (!target) return { error: 'That signup no longer exists.' };
  if (target.status === 'declined')
    return { error: `**${target.characterName}** declined this raid.` };
  if (target.roster === 'rostered' && target.status !== 'bench') {
    return { error: `**${target.characterName}** is already seated.` };
  }
  const slot = pickTargetGroup(requestedGroup, event, signups);
  if ('full' in slot) {
    const who = slot.takenBy ? ` (taken by **${slot.takenBy}**)` : '';
    return { error: `That seat is already taken${who}.` };
  }
  return { target, group: slot.group };
}

async function notifySeatedMember(
  ports: LeadsPorts,
  event: RaidEvent,
  target: Signup,
  role: Role,
  viaAlsoRole: boolean,
): Promise<void> {
  const [config, targetMember] = await Promise.all([
    ports.config(),
    ports.memberById(target.memberId),
  ]);
  const channel = signupChannelFor(config, event);
  if (!channel || !targetMember?.discordId) return;
  const asRole = viaAlsoRole ? ` as **${ROLE_LABEL[role]}**` : '';
  await ports.postMention(
    channel,
    `<@${targetMember.discordId}> You're in for **${event.name}**${asRole}.`,
    targetMember.discordId,
  );
}

async function handleSeat(
  ports: LeadsPorts,
  caller: Caller,
  event: RaidEvent,
  parsed: Extract<Parsed, { kind: 'seat' }>,
): Promise<InteractionResponse> {
  const signups = await ports.signups(event.id);
  const validated = validateSeatTarget(
    signups.find((s) => s.id === parsed.signupId),
    parsed.group,
    event,
    signups,
  );
  if ('error' in validated) return ephemeral(validated.error);
  const { target, group } = validated;

  // Flip status to going (preserving lateMinutes if late) and switch role if seated via alsoRoles.
  const viaAlsoRole = target.role !== parsed.role;
  const setRes = await ports.run(caller, 'signup-set', {
    eventId: event.id,
    characterId: target.characterId,
    status: target.lateMinutes !== null ? 'late' : 'accepted',
    ...(target.lateMinutes !== null ? { lateMinutes: target.lateMinutes } : {}),
    ...(viaAlsoRole ? { role: parsed.role } : {}),
  });
  if (!setRes.success) {
    return ephemeral(setRes.error?.message ?? `Could not seat ${target.characterName}.`);
  }

  const moveRes = await ports.run(caller, 'roster-move', { signupId: target.id, group });
  if (!moveRes.success) {
    return ephemeral(
      moveRes.error?.message ?? `Could not place ${target.characterName} in group ${group}.`,
    );
  }

  await notifySeatedMember(ports, event, target, parsed.role, viaAlsoRole);
  await ports.afterChange();
  const roleNote = viaAlsoRole ? ` as **${ROLE_LABEL[parsed.role]}**` : '';
  return ephemeral(`Seated **${target.characterName}**${roleNote} in group ${group}.`);
}

export async function handleLeadsInteraction(
  interaction: Interaction,
  ports: LeadsPorts,
): Promise<InteractionResponse | null> {
  const parsed = parseLeadsInteraction(interaction);
  if (!parsed) return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Random only handles raid lead buttons in the Vintage guild server.');
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member || !tierAllows(member.tier, 'leader')) {
    return ephemeral(NEEDS_LEADER);
  }
  const event = await ports.event(parsed.eventId);
  if (!event) return ephemeral('That raid no longer exists.');
  const caller: Caller = {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
  switch (parsed.kind) {
    case 'approve':
      return handleApprove(ports, caller, event);
    case 'redraft':
      return handleRedraft(ports, event);
    case 'seat':
      return handleSeat(ports, caller, event, parsed);
  }
}
