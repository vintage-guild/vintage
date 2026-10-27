// The Discord server event that mirrors a raid in the server's Events list. Pure: the tick sends
// what this renders and stores its hash, so the event is edited only when the raid changes.
// "Interested" on the event is Discord's own; it is not a signup and is never read back.
import type { ScheduledEventData } from '@vintage/discord-kit';
import type { TickEvent } from '../store';
import { hashJson } from './render';

/** Discord allows 100 SCHEDULED or ACTIVE events per server; we never hold more than this. */
export const MAX_SERVER_EVENTS = 25;

const MAX_NAME = 100;
const MAX_LOCATION = 100;
const MAX_DESCRIPTION = 1000;
const MINUTE = 60 * 1000;

export interface ServerEventLinks {
  /** The Discord server the signup card is in; null links to the site instead. */
  discordGuildId: string | null;
  siteUrl: string | null;
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/** Where members sign up: the signup card, or the site's home page (upcoming raids). */
export function signupLink(
  links: ServerEventLinks | undefined,
  post: { channelId: string; messageId: string | null },
): string | null {
  if (links?.discordGuildId && post.messageId) {
    return `https://discord.com/channels/${links.discordGuildId}/${post.channelId}/${post.messageId}`;
  }
  return links?.siteUrl ? links.siteUrl.replace(/\/$/, '') : null;
}

/** The server event's fields for a raid, inside Discord's limits. */
export function renderServerEvent(tick: TickEvent, link: string | null): ScheduledEventData {
  const { event } = tick;
  const where = link ? `Sign up: ${link}` : 'Sign up on the raid card in Discord.';
  const description = [
    `${event.size}-player ${event.instance}.`,
    where,
    '"Interested" here is not a signup.',
  ].join('\n');
  return {
    name: clip(event.name.trim() || event.instance, MAX_NAME),
    scheduled_start_time: new Date(event.startsAt).toISOString(),
    scheduled_end_time: new Date(event.startsAt + event.durationMinutes * MINUTE).toISOString(),
    description: clip(description, MAX_DESCRIPTION),
    entity_metadata: { location: clip(event.instance.trim() || 'Raid', MAX_LOCATION) },
  };
}

/** Stable hash of the event's fields, so it's edited only when they change. */
export const hashServerEvent = (data: ScheduledEventData): string => hashJson(data);
