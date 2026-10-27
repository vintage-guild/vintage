// Signup-note triage for the officer digest (#132). Notes ("late 20, work ran over", "can my alt
// come?") are free text the digest used to print raw. One Decisions request labels every note on
// a raid: what kind of note it is, and whether it asks an officer for something. The digest groups
// notes by kind and lifts the ones that need an officer. Below the thresholds, or on any failure,
// a note stays raw, exactly as before.
import {
  choiceAtLeast,
  type DecisionRequest,
  type DecisionResult,
  type DecisionsPort,
  predicateAtLeast,
  type Question,
} from '@vintage/decisions';

export const NOTE_KINDS = ['late', 'tentative', 'absent', 'swap', 'question', 'other'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

const KIND_CHOICES: { value: NoteKind; description: string }[] = [
  { value: 'late', description: 'Coming, but late or leaving early' },
  { value: 'tentative', description: 'Not sure yet whether they can come' },
  { value: 'absent', description: 'Cannot come, with or without a reason' },
  {
    value: 'swap',
    description: 'Wants to bring a different character, role, or spec, or to swap with someone',
  },
  { value: 'question', description: 'Asks something about the raid, the roster, or the rules' },
  { value: 'other', description: 'Anything else: a remark, a joke, logistics' },
];

/**
 * Thresholds from the labeled notes in tests/fixtures/signup-notes.json, scored live on
 * 2026-10-27. Kind at 0.7: 36 of 40 labeled, one arguable miss, four left raw. Needs an officer at
 * 0.3: no false flags (no negative scored above 0.01), 11 of 14 caught. The test re-checks both.
 */
export const NOTE_THRESHOLDS = { kind: 0.7, needsOfficer: 0.3 } as const;

/** At most this many notes per request (two questions each, under the API's 200). */
export const MAX_NOTES = 60;

export interface NoteInput {
  /** Stable within the request; answers come back by it. */
  id: string;
  who: string;
  note: string;
}

export interface NoteLabel {
  kind: NoteKind | null;
  needsOfficer: boolean;
}

const kindName = (i: number) => `kind_${i}`;
const officerName = (i: number) => `officer_${i}`;

/** One request for every note: the notes are the shared input, two questions per note. */
export function noteTriageRequest(notes: readonly NoteInput[], cacheKey: string): DecisionRequest {
  const batch = notes.slice(0, MAX_NOTES);
  const input = [
    'Raid signup notes from members of a World of Warcraft guild, one per line, numbered:',
    ...batch.map((n, i) => `Note ${i + 1} (${n.who}): ${n.note.replace(/\s+/g, ' ').trim()}`),
  ].join('\n');
  const questions: Question[] = batch.flatMap((_n, i) => [
    {
      type: 'choice',
      name: kindName(i),
      instructions: `What is note ${i + 1} about?`,
      choices: KIND_CHOICES,
    },
    {
      type: 'predicate',
      name: officerName(i),
      instructions: `Does note ${i + 1} ask an officer or raid leader to do, decide, or answer something?`,
    },
  ]);
  return { input, questions, cacheKey };
}

/** Labels by note id. A note the model was unsure about has `kind: null` and no officer flag. */
export function readNoteLabels(
  notes: readonly NoteInput[],
  result: DecisionResult | null,
): Map<string, NoteLabel> {
  const labels = new Map<string, NoteLabel>();
  notes.slice(0, MAX_NOTES).forEach((n, i) => {
    labels.set(n.id, {
      kind: choiceAtLeast<NoteKind>(result, kindName(i), NOTE_THRESHOLDS.kind),
      needsOfficer: predicateAtLeast(result, officerName(i), NOTE_THRESHOLDS.needsOfficer),
    });
  });
  return labels;
}

/**
 * Label every note on one raid, or null on any failure (no port, refused, thrown): the digest
 * then prints notes raw, exactly as before Decisions existed.
 */
export async function triageNotes(
  decisions: DecisionsPort | null | undefined,
  cacheKey: string,
  notes: readonly NoteInput[],
): Promise<Map<string, NoteLabel> | null> {
  if (!decisions || !notes.length) return null;
  try {
    const result = await decisions.ask(noteTriageRequest(notes, cacheKey));
    return readNoteLabels(notes, result);
  } catch {
    return null;
  }
}
