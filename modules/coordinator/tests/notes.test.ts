import { choiceAccuracy, pickThreshold } from '@vintage/decisions';
import { createFakeDecisions } from '@vintage/decisions/testing';
import { describe, expect, it } from 'vitest';
import {
  MAX_NOTES,
  NOTE_THRESHOLDS,
  noteTriageRequest,
  readNoteLabels,
  triageNotes,
} from '../src/domain/notes';
import fixture from './fixtures/signup-notes.json';

const notes = [
  { id: 's1', who: 'Bram', note: 'running about 20 min late' },
  { id: 's2', who: 'Kol', note: 'can I bring my alt?' },
];

describe('note triage thresholds (labeled fixture, scored live)', () => {
  const scored = fixture.notes.filter((n) => n.observed);

  it('has every note scored', () => {
    expect(scored).toHaveLength(fixture.notes.length);
    expect(scored.length).toBeGreaterThanOrEqual(40);
  });

  it('flags no note that does not need an officer, and catches most that do', () => {
    const examples = scored.map((n) => ({
      probability: n.observed!.needsOfficer,
      truth: n.needsOfficer,
    }));
    const lowest = pickThreshold(examples, 0);
    expect(lowest.threshold).toBeLessThanOrEqual(NOTE_THRESHOLDS.needsOfficer);
    const chosen = examples.filter((e) => e.probability >= NOTE_THRESHOLDS.needsOfficer);
    expect(chosen.filter((e) => !e.truth)).toEqual([]);
    expect(chosen.length / examples.filter((e) => e.truth).length).toBeGreaterThanOrEqual(0.75);
  });

  it('labels the kind correctly at least 95% of the time above the floor', () => {
    const { accuracy, answered } = choiceAccuracy(
      scored.map((n) => ({
        choice: n.observed!.kind,
        confidence: n.observed!.kindConfidence,
        truth: n.kind,
      })),
      NOTE_THRESHOLDS.kind,
    );
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    expect(answered / scored.length).toBeGreaterThanOrEqual(0.85);
  });
});

describe('noteTriageRequest and readNoteLabels', () => {
  it('asks two questions per note over one shared, numbered input', () => {
    const request = noteTriageRequest(notes, 'guild-1');
    expect(request.cacheKey).toBe('guild-1');
    expect(request.input).toContain('Note 1 (Bram): running about 20 min late');
    expect(request.input).toContain('Note 2 (Kol): can I bring my alt?');
    expect(request.questions.map((q) => q.name)).toEqual([
      'kind_0',
      'officer_0',
      'kind_1',
      'officer_1',
    ]);
  });

  it('caps a request at MAX_NOTES notes', () => {
    const many = Array.from({ length: MAX_NOTES + 5 }, (_, i) => ({
      id: `s${i}`,
      who: 'X',
      note: 'late',
    }));
    expect(noteTriageRequest(many, 'g').questions).toHaveLength(MAX_NOTES * 2);
  });

  it('keeps unsure answers unlabeled', async () => {
    const fake = createFakeDecisions({
      kind_0: { choice: 'late', confidence: 0.95 },
      officer_0: { predicate: 0.01 },
      kind_1: { choice: 'swap', confidence: 0.5 },
      officer_1: { predicate: 0.8 },
    });
    const labels = readNoteLabels(notes, await fake.ask(noteTriageRequest(notes, 'g')));
    expect(labels.get('s1')).toEqual({ kind: 'late', needsOfficer: false });
    expect(labels.get('s2')).toEqual({ kind: null, needsOfficer: true });
  });

  it('falls back to null on no port, no notes, or a failure', async () => {
    const fake = createFakeDecisions();
    fake.failNext();
    expect(await triageNotes(fake, 'g', notes)).toBeNull();
    expect(await triageNotes(null, 'g', notes)).toBeNull();
    expect(await triageNotes(createFakeDecisions(), 'g', [])).toBeNull();
  });
});
