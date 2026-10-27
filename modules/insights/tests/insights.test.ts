import { createFakeDecisions } from '@vintage/decisions/testing';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { fixedClock, makeCaller, previewAndConfirm, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { insightsCommands } from '../src/commands';
import type { InsightFinding } from '../src/contract';
import { findingsFor } from '../src/domain/findings';
import { gateFindings, plainDm } from '../src/domain/gate';
import { type RunSummaryV1, runUploadSchema } from '../src/farsight/run-summary';
import type { InsightsDeps } from '../src/store';
import { createMemoryInsightsDeps } from '../src/testing';

const death = (player: string, t: number, spell = 'Lava Burst', source = 'Ragnaros') => ({
  t,
  player,
  pull: 0,
  damage_last_10s: 9000,
  killing_blow: { source, spell, amount: 4000 },
  last_hits: [],
  own_casts_last_8s: [],
  environment: false,
});

/** A five-player run: Kol died twice to the same spell, Bram kicks early, Pip stands in fire. */
function summary(overrides: Partial<RunSummaryV1> = {}): RunSummaryV1 {
  return {
    run_key: 'WoWCombatLog-110526.txt:1793000000',
    file: 'WoWCombatLog-110526.txt',
    start_ts: 1793000000,
    end_ts: 1793003600,
    start_offset: 0,
    end_offset: 1,
    zone_id: 409,
    zone_name: 'Molten Core',
    difficulty: 0,
    is_instance: true,
    map_id: null,
    map_name: null,
    map_bounds: null,
    build: '1.60.1',
    project: '18',
    events: 1000,
    duration: 3600,
    in_combat: 2400,
    between_pulls: 1200,
    avg_gap: 30,
    longest_gap: null,
    tank: 'Tankard-Realm',
    roster: [
      { name: 'Tankard-Realm', done: 100, heal: 0, taken: 50000, deaths: 0 },
      { name: 'Kol-Realm', done: 10, heal: 90000, taken: 8000, deaths: 2 },
      { name: 'Bram-Realm', done: 60000, heal: 0, taken: 6000, deaths: 0 },
      { name: 'Pip-Realm', done: 50000, heal: 0, taken: 60000, deaths: 1 },
      { name: 'Ada-Realm', done: 55000, heal: 0, taken: 5000, deaths: 0 },
    ],
    pulls: [],
    deaths: [
      death('Kol-Realm', 125),
      death('Kol-Realm', 1810),
      death('Pip-Realm', 600, 'Fire', 'Lava'),
    ],
    interrupts: [],
    kicks: [
      { player: 'Bram-Realm', attempts: 6, landed: 2 },
      { player: 'Ada-Realm', attempts: 4, landed: 4 },
    ],
    abilities: [],
    mobs: [],
    encounters: [],
    ...overrides,
  };
}

const upload = (run = summary()) => ({
  schema: 'farsight.run' as const,
  version: 1 as const,
  parser: { name: '@farsight/core', version: '0.1.0' },
  run,
});

describe('findingsFor', () => {
  it('turns the log into one-raider claims with evidence, heaviest first', () => {
    const findings = findingsFor(summary());
    const by = (name: string) => findings.filter((f) => f.character === name).map((f) => f.kind);
    expect(by('Kol')).toEqual(['killed-by', 'deaths']);
    expect(findings.find((f) => f.kind === 'killed-by')?.text).toMatch(
      /Lava Burst \(Ragnaros\) killed you 2 times/,
    );
    expect(findings.find((f) => f.character === 'Kol' && f.kind === 'deaths')?.evidence).toBe(
      'at 2:05, 30:10',
    );
    expect(by('Bram')).toEqual(['kicks']);
    expect(by('Pip')).toEqual(expect.arrayContaining(['deaths', 'damage-taken']));
    expect(by('Tankard')).toEqual([]); // the tank's intake is the job
    expect(by('Ada')).toEqual([]); // nothing worth saying
    expect(findings[0]?.weight).toBe(3);
  });

  it('accepts the Farsight upload envelope and nothing else', () => {
    expect(runUploadSchema.safeParse(upload()).success).toBe(true);
    expect(runUploadSchema.safeParse({ ...upload(), schema: 'other' }).success).toBe(false);
  });
});

const officer = makeCaller('officer');
const kol = makeCaller('raider', { memberId: 'm-kol' });
const pip = makeCaller('raider', { memberId: 'm-pip' });

let harness: ReturnType<typeof createMemoryInsightsDeps>;
let registry: ReturnType<typeof testRegistry<InsightsDeps>>;

beforeEach(() => {
  harness = createMemoryInsightsDeps({ Kol: 'm-kol', Pip: 'm-pip', Bram: 'm-bram' });
  registry = testRegistry<InsightsDeps>([...insightsCommands], fixedClock(Date.UTC(2026, 10, 6)));
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, harness.deps);
const data = <T>(r: CommandResult<unknown>) => {
  if (!r.success) throw new Error(`failed: ${r.error?.code}`);
  return r.data as T;
};
const code = (r: CommandResult<unknown>) => (r.success ? 'OK' : r.error?.code);

describe('run-import and insights-get', () => {
  it('imports once, links characters to members, and keeps findings private to each raider', async () => {
    const first = data<{ runId: string; imported: boolean; linked: number; raiders: number }>(
      await run('run-import', { upload: upload() }, kol),
    );
    expect(first).toMatchObject({ imported: true, raiders: 5, linked: 3 });
    expect(
      data<{ imported: boolean }>(await run('run-import', { upload: upload() }, kol)).imported,
    ).toBe(false);
    expect(harness.deps.insights.runs.size).toBe(1);

    const mine = data<{ findings: InsightFinding[] }>(await run('insights-get', {}, kol));
    expect(new Set(mine.findings.map((f) => f.character))).toEqual(new Set(['Kol']));
    const all = data<{ findings: InsightFinding[] }>(
      await run('insights-get', { runId: first.runId }, officer),
    );
    expect(new Set(all.findings.map((f) => f.character))).toEqual(new Set(['Kol', 'Bram', 'Pip']));
    expect(code(await run('run-import', { upload: upload() }, makeCaller('member')))).toBe(
      'COMMAND_NOT_FOUND',
    );
  });

  it('refuses something that is not a Farsight upload', async () => {
    expect(code(await run('run-import', { upload: { run: {} } }, kol))).toBe('VALIDATION_ERROR');
  });

  it('takes runs only from someone who was in them, officers excepted', async () => {
    const stranger = makeCaller('raider', { memberId: 'm-stranger' });
    expect(code(await run('run-import', { upload: upload() }, stranger))).toBe('NOT_IN_RUN');
    expect(code(await run('run-import', { upload: upload() }, officer))).toBe('OK');
  });

  it('refuses an upload too large to be one run', async () => {
    const roster = Array.from({ length: 41 }, (_, i) => ({
      name: `P${i}-Realm`,
      done: 0,
      heal: 0,
      taken: 0,
      deaths: 0,
    }));
    expect(code(await run('run-import', { upload: upload(summary({ roster })) }, officer))).toBe(
      'UPLOAD_TOO_LARGE',
    );
    const zone_name = 'x'.repeat(129);
    expect(code(await run('run-import', { upload: upload(summary({ zone_name })) }, kol))).toBe(
      'UPLOAD_TOO_LARGE',
    );
  });

  it('strips links, markdown, and mentions from upload text before anyone reads it', async () => {
    const bait = '[Claim your reward](https://evil.example/login) @everyone';
    const tampered = summary({
      zone_name: bait,
      deaths: [death('Kol-Realm', 125, bait, 'x'), death('Kol-Realm', 1810, bait, 'x')],
    });
    const { runId } = data<{ runId: string }>(
      await run('run-import', { upload: upload(tampered) }, kol),
    );
    const mine = data<{ run: { zoneName: string }; findings: InsightFinding[] }>(
      await run('insights-get', { runId }, kol),
    );
    const text = [mine.run.zoneName, ...mine.findings.map((f) => f.text)].join('\n');
    // No masked link, no URL, no mention: the brackets, slashes, and @ are gone.
    expect(text).not.toMatch(/[[\]@/<>*_`~|#]|:\/\//);
    expect(mine.run.zoneName.length).toBeLessThanOrEqual(64);
  });

  it('counts two realms’ characters of one name once', () => {
    const roster = [
      { name: 'Bob-RealmA', done: 1, heal: 0, taken: 1, deaths: 1 },
      { name: 'Bob-RealmB', done: 1, heal: 0, taken: 1, deaths: 1 },
    ];
    const findings = findingsFor(summary({ roster, deaths: [death('Bob-RealmA', 5)], kicks: [] }));
    expect(findings.map((f) => f.kind)).toEqual(['deaths']);
  });
});

describe('insights-send', () => {
  it('previews who opted in, then sends once', async () => {
    const { runId } = data<{ runId: string }>(await run('run-import', { upload: upload() }, kol));
    await run('insights-optin-set', { dms: true }, kol);
    await run('insights-optin-set', { dms: false }, pip);
    const { preview, result } = await previewAndConfirm(
      registry,
      { name: 'insights-send', input: { runId }, caller: officer },
      harness.deps,
    );
    const shown = (
      preview as {
        data: {
          preview: { wouldMessage: string[]; messages: { character: string; text: string }[] };
        };
      }
    ).data.preview;
    expect(shown.wouldMessage).toEqual(['Kol']);
    // The officer sees what each DM will say before confirming.
    expect(shown.messages).toEqual([
      { character: 'Kol', text: expect.stringMatching(/Lava Burst \(Ragnaros\) killed you 2/) },
    ]);
    expect(code(result)).toBe('OK');
    expect(harness.sent).toEqual([runId]);
    const again = await previewAndConfirm(
      registry,
      { name: 'insights-send', input: { runId }, caller: officer },
      harness.deps,
    );
    expect(code(again.result)).toBe('ALREADY_SENT');
    expect(code(await run('insights-send', { runId }, kol))).toBe('COMMAND_NOT_FOUND');
  });
});

describe('the DM gate', () => {
  const findings = findingsFor(summary())
    .filter((f) => f.character === 'Kol')
    .map((f, i) => ({ ...f, id: `f${i}`, guildId: 'g', runId: 'r', memberId: 'm-kol' }));

  it('drops a finding the model is sure is unhelpful, keeps at most two, never drops all', async () => {
    const dropFirst = createFakeDecisions({
      useless_0: { predicate: 0.9 },
      useless_1: { predicate: 0.1 },
    });
    // Kol's findings are [killed-by, deaths]; the first is dropped.
    expect((await gateFindings(dropFirst, findings, 'g')).map((f) => f.kind)).toEqual(['deaths']);
    const dropAll = createFakeDecisions({
      useless_0: { predicate: 0.95 },
      useless_1: { predicate: 0.95 },
    });
    expect(await gateFindings(dropAll, findings, 'g')).toHaveLength(2);
    const failing = createFakeDecisions();
    failing.failNext();
    expect(await gateFindings(failing, findings, 'g')).toHaveLength(2);
    expect(await gateFindings(null, [], 'g')).toEqual([]);
  });

  it('writes a plain DM with the evidence and how to stop them', () => {
    const text = plainDm('Molten Core', findings);
    expect(text).toMatch(/^From the Molten Core log:/);
    expect(text).toMatch(/\(at 2:05, 30:10\)/);
    expect(text).toMatch(/insights-optin-set dms:false/);
  });
});
