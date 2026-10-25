// Discord timestamp markup: every posted time renders in the reader's own timezone (PLAN §6.2).

export const TimestampStyle = {
  /** 16:20 */
  SHORT_TIME: 't',
  /** 16:20:30 */
  LONG_TIME: 'T',
  /** 20/04/2021 */
  SHORT_DATE: 'd',
  /** 20 April 2021 */
  LONG_DATE: 'D',
  /** 20 April 2021 16:20 */
  SHORT_DATE_TIME: 'f',
  /** Tuesday, 20 April 2021 16:20 */
  LONG_DATE_TIME: 'F',
  /** 2 months ago */
  RELATIVE: 'R',
} as const;
export type TimestampStyle = (typeof TimestampStyle)[keyof typeof TimestampStyle];

/**
 * `<t:unix:style>` for a Date or a millisecond epoch. Defaults to the long date-time (`F`).
 */
export function discordTimestamp(
  when: Date | number,
  style: TimestampStyle = TimestampStyle.LONG_DATE_TIME,
): string {
  const ms = typeof when === 'number' ? when : when.getTime();
  if (!Number.isFinite(ms)) throw new Error('discordTimestamp needs a valid date');
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}
