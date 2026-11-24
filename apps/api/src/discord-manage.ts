// The Manage button on a signup card: move or cancel an event from Discord. Pure over ports, so
// Convex (convex/discord.ts) and the JTBD host run the same flow:
//   button  manage:<eventId>          → a private menu: the event, Move, Cancel event
//   button  manage:move:<eventId>     → modal `manage:when:<eventId>`: a date (the next 25 days in
//                                       the guild's clock) and a half-hour time, on the event's own
//   modal   manage:when:<eventId>     → raid-update as the member, then a tick; the menu
//                                       becomes "Moved **X** to …"
//   button  manage:cancel:<eventId>   → raid-cancel's preview: who's signed up, Yes, cancel / Keep it
//   button  manage:confirm:<eventId>  → a fresh raid-cancel preview, confirmed at once (like
//                                       char-rm), then a tick redraws the card as cancelled
//   button  manage:keep:<eventId>     → "Nothing changed."
//
// The card is public, so anyone can click Manage: every step checks the server, the member, and
// the Raid Leader tier first, and the commands check the tier and every rule again. Replies are
// private; the public card is edited only by the coordinator tick.
import {
  actionRow,
  ButtonStyle,
  button,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  label,
  modal,
  modalSelections,
  reply,
  stringSelect,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import { wallClock, zonedTime } from '@vintage/raids/commands';
import { kindNoun, type RaidEvent } from '@vintage/raids/contract';
import { discordCaller, ephemeral, failureText, type MemberPorts } from './discord-common';
import { dateOptions, timeOptions, zoneCity } from './discord-event-form';
import { guildClock, when } from './discord-events';

export const MANAGE_PREFIX = 'manage';
const STEPS = ['move', 'when', 'cancel', 'confirm', 'keep'] as const;
type Step = (typeof STEPS)[number] | 'menu';

export const NEEDS_LEADER_MANAGE =
  'Moving or cancelling events needs the Raid Leader rank or higher. Ask a raid leader or officer.';
export const NOTHING_CHANGED = 'Nothing changed.';

export interface ManagePorts extends MemberPorts {
  /** Runs a command through the registry as this caller (with a confirm token for raid-cancel). */
  run(
    caller: Caller,
    name: string,
    input: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<unknown>>;
  /** The event changed: start a coordinator tick so its card follows now. */
  afterChange(): Promise<void>;
  now(): number;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The step and event on a `manage:…` custom id, or null when it isn't one. */
export function parseManageId(
  customId: string | undefined,
): { step: Step; eventId: string } | null {
  const parts = (customId ?? '').split(':');
  if (parts[0] !== MANAGE_PREFIX) return null;
  if (parts.length === 2 && ID.test(parts[1]!)) return { step: 'menu', eventId: parts[1]! };
  if (
    parts.length === 3 &&
    (STEPS as readonly string[]).includes(parts[1]!) &&
    ID.test(parts[2]!)
  ) {
    return { step: parts[1] as Step, eventId: parts[2]! };
  }
  return null;
}

const idOf = (step: Exclude<Step, 'menu'>, eventId: string) =>
  `${MANAGE_PREFIX}:${step}:${eventId}`;

const done = (content: string) =>
  updateMessage({ content, embeds: [], components: [], allowed_mentions: { parse: [] } });

const pad = (n: number) => String(n).padStart(2, '0');

/** The menu, privately: what the event is, and what a leader can do to it. */
function menu(event: RaidEvent): InteractionResponse {
  return reply(
    {
      content: `**${event.name}** · ${when(event.startsAt)}\nWhat do you want to change?`,
      components: [
        actionRow(
          button(idOf('move', event.id), 'Move', ButtonStyle.PRIMARY),
          button(idOf('cancel', event.id), `Cancel ${kindNoun(event.kind)}`, ButtonStyle.DANGER),
        ),
      ],
      allowed_mentions: { parse: [] },
    },
    { ephemeral: true },
  );
}

/** The Move form: the event's own day and time picked, in the guild's clock. */
async function moveForm(ports: ManagePorts, caller: Caller, event: RaidEvent) {
  const clock = await guildClock(ports, caller);
  const at = wallClock(event.startsAt, clock.zone);
  const date = `${at.year}-${pad(at.month)}-${pad(at.day)}`;
  const time = `${pad(at.hour)}:${pad(at.minute)}`;
  return modal(
    idOf('when', event.id),
    `Move ${event.name}`.slice(0, 45),
    label('Date', stringSelect('date', dateOptions(clock.zone, ports.now(), date))),
    label(
      `Time (${zoneCity(clock.zone)})`.slice(0, 45),
      stringSelect('time', timeOptions(clock.time, time)),
      `In the guild’s clock (${clock.zone})`.slice(0, 100),
    ),
  );
}

/** The Move form came back: raid-update to the picked day and time. */
async function move(
  ports: ManagePorts,
  caller: Caller,
  event: RaidEvent,
  interaction: Interaction,
) {
  const picked = modalSelections(interaction);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(picked.date?.[0] ?? '');
  const time = /^(\d{2}):(\d{2})$/.exec(picked.time?.[0] ?? '');
  if (!date || !time) return ephemeral('Pick a day and a time to move it to.');
  const { zone } = await guildClock(ports, caller);
  const startsAt = zonedTime(
    {
      year: Number(date[1]),
      month: Number(date[2]),
      day: Number(date[3]),
      hour: Number(time[1]),
      minute: Number(time[2]),
    },
    zone,
  );
  if (startsAt === event.startsAt) return done(NOTHING_CHANGED);
  const result = await ports.run(caller, 'raid-update', { eventId: event.id, startsAt });
  if (!result.success) return done(failureText(result, NEEDS_LEADER_MANAGE));
  await ports.afterChange();
  return done(
    `Moved **${event.name}** to ${when(startsAt)}. Signups and the roster came along; ` +
      'the signup post updates in a moment.',
  );
}

/** Cancel, step one: raid-cancel's preview, and a button to confirm it. */
async function cancelAsk(ports: ManagePorts, caller: Caller, event: RaidEvent) {
  const preview = await ports.run(caller, 'raid-cancel', { eventId: event.id });
  if (!preview.success) return done(failureText(preview, NEEDS_LEADER_MANAGE));
  const signups = (preview.data as { preview?: { signups?: number } }).preview?.signups ?? 0;
  const who =
    signups === 0
      ? 'Nobody has signed up yet.'
      : `${signups} ${signups === 1 ? 'person has' : 'people have'} signed up; their signups stay for history.`;
  return updateMessage({
    content: `Cancel **${event.name}** (${when(event.startsAt)})? ${who} This can't be undone.`,
    components: [
      actionRow(
        button(idOf('confirm', event.id), 'Yes, cancel it', ButtonStyle.DANGER),
        button(idOf('keep', event.id), 'Keep it', ButtonStyle.SECONDARY),
      ),
    ],
    allowed_mentions: { parse: [] },
  });
}

/** Cancel, step two: a fresh preview, confirmed at once. */
async function cancelConfirm(ports: ManagePorts, caller: Caller, event: RaidEvent) {
  const input = { eventId: event.id };
  const preview = await ports.run(caller, 'raid-cancel', input);
  if (!preview.success) return done(failureText(preview, NEEDS_LEADER_MANAGE));
  const token = (preview.data as { confirmToken?: string }).confirmToken;
  const result = await ports.run(caller, 'raid-cancel', input, token);
  if (!result.success) return done(failureText(result, NEEDS_LEADER_MANAGE));
  await ports.afterChange();
  return done(`Cancelled **${event.name}**. The signup post shows it as cancelled in a moment.`);
}

/**
 * A step of the Manage flow, or null when the interaction isn't one. Every step checks the
 * server and the member (discordCaller) and the Raid Leader tier before anything else.
 */
export async function handleManageInteraction(
  interaction: Interaction,
  ports: ManagePorts,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.MESSAGE_COMPONENT &&
    interaction.type !== InteractionType.MODAL_SUBMIT
  ) {
    return null;
  }
  const parsed = parseManageId(interaction.data?.custom_id);
  if (!parsed) return null;
  const { step, eventId } = parsed;
  const who = await discordCaller(interaction, ports, 'raids');
  if ('refusal' in who) return who.refusal;
  const { caller } = who;
  // The menu is a new private reply; every later step edits that reply.
  const say = (content: string) => (step === 'menu' ? ephemeral(content) : done(content));
  if (!tierAllows(caller.tier, 'leader')) return say(NEEDS_LEADER_MANAGE);
  if (step === 'keep') return done(NOTHING_CHANGED);

  const got = await ports.run(caller, 'raid-get', { eventId });
  const event = got.success ? (got.data as { event: RaidEvent }).event : null;
  if (!event) return say('I can’t find that event any more.');
  if (event.status !== 'open' && event.status !== 'locked') {
    return say(`**${event.name}** is ${event.status}, so it can’t be changed.`);
  }
  switch (step) {
    case 'menu':
      return menu(event);
    case 'move':
      return moveForm(ports, caller, event);
    case 'when':
      return move(ports, caller, event, interaction);
    case 'cancel':
      return cancelAsk(ports, caller, event);
    case 'confirm':
      return cancelConfirm(ports, caller, event);
  }
}
