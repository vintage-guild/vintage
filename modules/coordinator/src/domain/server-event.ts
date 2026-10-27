// The Discord server event that mirrors a raid in the server's Events list. Pure: the tick sends
// what this renders and stores its hash, so the event is edited only when the raid changes.
// "Interested" on the event is Discord's own; it is not a signup and is never read back.
import type { ScheduledEventData } from '@vintage/discord-kit';
import { KIND_LABELS, kindOf } from '@vintage/raids/contract';
import type { TickEvent } from '../store';
import { eventTitle, noun } from './kind-words';
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

/**
 * The server event's fields, inside Discord's limits. Like the card, the words follow the kind:
 * "Dungeon · SM Cathedral", "5-player dungeon: Scarlet Monastery."; a raid keeps its own name.
 */
export function renderServerEvent(tick: TickEvent, link: string | null): ScheduledEventData {
  const { event } = tick;
  const where = link ? `Sign up: ${link}` : `Sign up on the ${noun(event)} card in Discord.`;
  // "5-player dungeon: Scarlet Monastery.", or "Open event: Westfall." with no size; an `other`
  // event may name no instance at all.
  const what = event.size === null ? `Open ${noun(event)}` : `${event.size}-player ${noun(event)}`;
  const description = [
    event.instance ? `${what}: ${event.instance}.` : `${what}.`,
    where,
    '"Interested" here is not a signup.',
  ].join('\n');
  const name = event.name.trim() || event.instance || KIND_LABELS[kindOf(event)];
  return {
    name: clip(eventTitle({ ...event, name }), MAX_NAME),
    scheduled_start_time: new Date(event.startsAt).toISOString(),
    scheduled_end_time: new Date(event.startsAt + event.durationMinutes * MINUTE).toISOString(),
    description: clip(description, MAX_DESCRIPTION),
    entity_metadata: {
      location: clip(event.instance.trim() || KIND_LABELS[kindOf(event)], MAX_LOCATION),
    },
  };
}

/** Stable hash of the event's fields, so it's edited only when they change. */
export const hashServerEvent = (data: ScheduledEventData): string => hashJson(data);
