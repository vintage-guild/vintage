// The raid summary (#221, #29): once an officer records the addon's export, the signup channel
// gets one post for the raid, under its card: how the bosses went, who came, and what dropped.
// It's edited in place when a different export replaces the record. Pure: data in, MessageData out.
import { discordColor } from '@vintage/design-tokens';
import {
  discordTimestamp,
  type EmbedField,
  embed,
  type MessageData,
  TimestampStyle,
} from '@vintage/discord-kit';
import type { RecordBosses } from '@vintage/raids/contract';
import type { TickDrop, TickRecorded } from '../store';
import { cardTitle } from './kind-words';

const FIELD_MAX = 1024;
const MINUTE = 60 * 1000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "2h 41m", "1h", "45m", to the nearest minute. */
export function durationText(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * "Bosses: 6/8, 14 wipes, 2h 41m", from the first pull to the end of the last attempt. Without a
 * launch raid to count against (a dungeon, or names the game spells differently): "3 killed".
 */
export function bossesLine(bosses: RecordBosses): string {
  const killed =
    bosses.total === null ? `${bosses.killed} killed` : `${bosses.killed}/${bosses.total}`;
  const time = durationText(bosses.lastEndAt - bosses.firstPullAt);
  return `Bosses: ${killed}, ${plural(bosses.wipes, 'wipe')}, ${time}`;
}

/** Names shown before "+N more": a 40-person raid and a few pick-ups fit. */
export const CAME_CAP = 45;
/** Drops shown before "+N more"; a night's loot rarely runs longer. */
export const LOOT_CAP = 20;

/** Up to `cap` items, then "+N more", within a field; `empty` for none. */
function listed(items: string[], cap: number, separator: string, empty: string): string {
  if (!items.length) return empty;
  const shown =
    items.length <= cap ? items : [...items.slice(0, cap), `+${items.length - cap} more`];
  return shown.join(separator).slice(0, FIELD_MAX);
}

const dropLine = (d: TickDrop) =>
  `${d.itemName ?? `Item ${d.itemId}`}${d.count > 1 ? ` ×${d.count}` : ''} → ${d.looter}`;

/** The summary post: bosses first, then the night and whose export it was, who came, the loot. */
export function renderRaidSummary({ tick, record, attended, drops }: TickRecorded): MessageData {
  const { event } = tick;
  const description = [
    ...(record.bosses ? [`**${bossesLine(record.bosses)}**`] : []),
    `-# ${discordTimestamp(event.startsAt, TimestampStyle.LONG_DATE_TIME)} · from ${record.exporter}’s export`,
  ].join('\n');
  const fields: EmbedField[] = [
    { name: `Came · ${attended.length}`, value: listed(attended, CAME_CAP, ', ', 'Nobody') },
    {
      name: `Loot · ${drops.length}`,
      value: listed(drops.map(dropLine), LOOT_CAP, '\n', 'Nothing dropped'),
    },
  ];
  return {
    embeds: [
      embed({
        title: `Raid summary · ${cardTitle(event)}`,
        description,
        color: discordColor('color.border.strong'),
        fields,
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}
