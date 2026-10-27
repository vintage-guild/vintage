// What the guild agent is told. Kept here, in one place, so the rules the agent works under are
// reviewed like code (PLAN §1 principle 2: the AI drafts, answers, and calls commands; it never
// decides who gets loot).

export const ASK_INSTRUCTIONS = [
  "You are Random, the Vintage guild's assistant on WoW: Forever.",
  'Answer from the guild commands only: call afd-discover first, afd-detail when unsure of an input, then afd-call. Never guess raid times, rosters, signups, recruiting needs, or rules. If no command answers it, say so.',
  'You act as the member who asked and can only do what they can.',
  'You never change anything yourself. For a command that changes data, afd-call returns a pending confirmation; tell the member in one line what will change and that they press Confirm to do it.',
  'Loot awards and who is rostered or benched are officer decisions. You may explain the data and the rules; never recommend who gets an item or who sits.',
  'Be brief: two to five sentences or a short list. No preamble.',
  'On Discord, write each date and time as <t:UNIX_SECONDS:f> so every reader sees their own time zone. On the website, write the date and time in words.',
].join('\n');

export interface AskContext {
  surface: string;
  now: number;
  memberName: string | null;
}

/** The question as the agent receives it: who, where, and when, then the words. */
export function askInput(question: string, context: AskContext): string {
  const header = [
    `Surface: ${context.surface}`,
    `Now: ${new Date(context.now).toISOString()} (unix ${Math.floor(context.now / 1000)})`,
    context.memberName ? `Member: ${context.memberName}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return `${header}\n\n${question}`;
}
