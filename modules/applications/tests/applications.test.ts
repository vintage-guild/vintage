import { createFakeDecisions } from '@vintage/decisions/testing';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { fixedClock, makeCaller, previewAndConfirm, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { applicationsCommands } from '../src/commands';
import type { Application } from '../src/contract';
import { labelApplication, labelRequest, readLabels } from '../src/domain/labels';
import {
  applicationCustomId,
  applyFormCustomId,
  labelsLine,
  parseApplicationCustomId,
  renderApplicationPost,
  renderRecruitingPost,
} from '../src/render/discord';
import type { ApplicationsDeps } from '../src/store';
import { createMemoryApplicationsDeps } from '../src/testing';

const NOW = Date.UTC(2026, 9, 27, 18);
const guest = makeCaller('public', { discordId: 'd-kol', surface: 'discord' });
const stranger = makeCaller('public', { discordId: 'd-other', surface: 'discord' });
const officer = makeCaller('officer');
const raider = makeCaller('raider');

const form = {
  characterName: 'kol',
  wowClass: 'shaman',
  spec: 'Restoration',
  role: 'raider',
  about: 'Long-time healer, calm on voice.',
  experience: 'Cleared MC and BWL in 2019 as main heals.',
  availability: 'Tue, Thu, Sun evenings EU',
  applicantName: 'Kol',
};

let clock: ReturnType<typeof fixedClock>;
let harness: ReturnType<typeof createMemoryApplicationsDeps>;
let registry: ReturnType<typeof testRegistry<ApplicationsDeps>>;

beforeEach(() => {
  clock = fixedClock(NOW);
  harness = createMemoryApplicationsDeps();
  registry = testRegistry<ApplicationsDeps>([...applicationsCommands], clock);
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, harness.deps);
const code = (r: CommandResult<unknown>) => (r.success ? 'OK' : r.error?.code);
const data = <T>(r: CommandResult<unknown>) => {
  if (!r.success) throw new Error(`failed: ${r.error?.code}`);
  return r.data as T;
};

describe('application-submit', () => {
  it('saves the application as new and schedules labeling and the post', async () => {
    const own = data<{ id: string; status: string }>(await run('application-submit', form, guest));
    expect(own).toMatchObject({ status: 'new', characterName: 'Kol', role: 'raider' });
    expect(own).not.toHaveProperty('labels');
    expect(harness.effects).toEqual([{ effect: 'submitted', applicationId: own.id }]);
    expect(harness.deps.applications.rows.get(own.id)).toMatchObject({
      discordId: 'd-kol',
      applicantName: 'Kol',
    });
  });

  it('needs a Discord account, refuses raiders, and allows one open application', async () => {
    expect(code(await run('application-submit', form, makeCaller('public')))).toBe(
      'DISCORD_REQUIRED',
    );
    expect(code(await run('application-submit', form, raider))).toBe('ALREADY_RAIDING');
    await run('application-submit', form, guest);
    expect(code(await run('application-submit', form, guest))).toBe('APPLICATION_OPEN');
  });

  it('keeps one open application however old it is', async () => {
    await run('application-submit', form, guest);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(code(await run('application-submit', form, guest))).toBe('APPLICATION_OPEN');
  });

  it('caps applications per person per month', async () => {
    for (let i = 0; i < 3; i++) {
      const { id } = data<{ id: string }>(await run('application-submit', form, guest));
      await run('application-withdraw', { applicationId: id }, guest);
    }
    expect(code(await run('application-submit', form, guest))).toBe('TOO_MANY_APPLICATIONS');
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(code(await run('application-submit', form, guest))).toBe('OK');
  });

  it('validates the class and the role', async () => {
    expect(code(await run('application-submit', { ...form, wowClass: 'monk' }, guest))).toBe(
      'VALIDATION_ERROR',
    );
    expect(code(await run('application-submit', { ...form, role: 'social' }, guest))).toBe(
      'VALIDATION_ERROR',
    );
  });
});

describe('reading applications', () => {
  it('shows applicants their own status, officers everything, others nothing', async () => {
    const { id } = data<{ id: string }>(await run('application-submit', form, guest));
    expect(data<{ id: string }>(await run('application-get', {}, guest)).id).toBe(id);
    expect(data(await run('application-get', {}, stranger))).toBeNull();
    expect(code(await run('application-get', { applicationId: id }, stranger))).toBe(
      'APPLICATION_NOT_FOUND',
    );
    expect(
      data<Application>(await run('application-get', { applicationId: id }, officer)),
    ).toHaveProperty('about');
    expect(code(await run('application-list', {}, raider))).toBe('COMMAND_NOT_FOUND');
    expect(
      data<Application[]>(await run('application-list', { statuses: ['new'] }, officer)),
    ).toHaveLength(1);
  });
});

describe('review and decline', () => {
  it('accepting with a reply schedules the reply, the role, and the post refresh', async () => {
    const { id } = data<{ id: string }>(await run('application-submit', form, guest));
    harness.effects.length = 0;
    const saved = data<Application>(
      await run(
        'application-review',
        { applicationId: id, status: 'accepted', reply: 'Welcome!' },
        officer,
      ),
    );
    expect(saved).toMatchObject({
      status: 'accepted',
      reply: 'Welcome!',
      reviewedBy: officer.memberId,
    });
    expect(harness.effects.map((e) => e.effect)).toEqual(['replied', 'accepted', 'changed']);
    expect(
      code(await run('application-review', { applicationId: id, status: 'in-review' }, officer)),
    ).toBe('APPLICATION_CLOSED');
  });

  it('declines only after a preview, and the applicant sees it', async () => {
    const { id } = data<{ id: string }>(await run('application-submit', form, guest));
    const { preview, result } = await previewAndConfirm(
      registry,
      {
        name: 'application-decline',
        input: { applicationId: id, reply: 'Full on healers' },
        caller: officer,
      },
      harness.deps,
    );
    expect(JSON.stringify(preview)).toMatch(/wouldDecline/);
    expect(code(result)).toBe('OK');
    expect(
      data<{ status: string; reply: string }>(await run('application-get', {}, guest)),
    ).toMatchObject({
      status: 'declined',
      reply: 'Full on healers',
    });
  });

  it('config: channel and onboarding, officer only', async () => {
    expect(code(await run('application-config-set', {}, officer))).toBe('NOTHING_TO_CHANGE');
    const saved = data<{ channelId: string }>(
      await run('application-config-set', { channelId: '400000000000000011' }, officer),
    );
    expect(saved.channelId).toBe('400000000000000011');
    expect(code(await run('application-config-set', { channelId: 'nope' }, officer))).toBe(
      'VALIDATION_ERROR',
    );
    expect(code(await run('application-config-get', {}, raider))).toBe('COMMAND_NOT_FOUND');
  });
});

const sample = (overrides: Partial<Application> = {}): Application => ({
  id: 'app-1',
  guildId: 'g',
  discordId: 'd-kol',
  applicantName: 'Kol',
  characterName: 'Kol',
  wowClass: 'shaman',
  spec: 'restoration',
  role: 'raider',
  about: 'a',
  experience: 'b',
  availability: 'c',
  status: 'new',
  labels: null,
  reply: null,
  reviewedBy: null,
  reviewedAt: null,
  postChannelId: null,
  postMessageId: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('labels', () => {
  it('asks three questions over the application and the open needs', () => {
    const request = labelRequest(
      sample(),
      [
        { wowClass: 'shaman', specs: 'restoration', need: 'high' },
        { wowClass: 'rogue', specs: 'any', need: 'closed' },
      ],
      'g',
    );
    expect(request.input).toContain('Open recruiting needs: shaman (restoration, high).');
    expect(request.input).toContain('Character: Kol, restoration shaman');
    expect(request.questions.map((q) => q.name)).toEqual(['role', 'complete', 'fit']);
  });

  it('reads confident answers and leaves the rest unsure', async () => {
    const sure = createFakeDecisions({
      role: { choice: 'raider', confidence: 0.95 },
      complete: { predicate: 0.9 },
      fit: { score: 2.7, confidence: 0.8 },
    });
    expect(await labelApplication(sure, sample(), [], NOW)).toEqual({
      role: 'raider',
      complete: true,
      fit: 3,
      labeledAt: NOW,
    });
    const unsure = createFakeDecisions({
      role: { choice: 'social', confidence: 0.5 },
      complete: { predicate: 0.5 },
      fit: { score: 1, confidence: 0.3 },
    });
    expect(await labelApplication(unsure, sample(), [], NOW)).toEqual({
      role: null,
      complete: null,
      fit: null,
      labeledAt: NOW,
    });
    expect(
      readLabels(
        await createFakeDecisions({ complete: { predicate: 0.1 } }).ask(
          labelRequest(sample(), [], 'g'),
        ),
        NOW,
      ).complete,
    ).toBe(false);
    const failing = createFakeDecisions();
    failing.failNext();
    expect(await labelApplication(failing, sample(), [], NOW)).toBeNull();
    expect(await labelApplication(null, sample(), [], NOW)).toBeNull();
  });
});

describe('Discord rendering', () => {
  it('round-trips custom ids, including the apply form', () => {
    const id = applyFormCustomId({
      wowClass: 'shaman',
      role: 'flex-raider',
      characterName: 'Kol',
      spec: 'Resto: heals',
    });
    expect(id.length).toBeLessThanOrEqual(100);
    expect(parseApplicationCustomId(id)).toEqual({
      action: 'form',
      form: { wowClass: 'shaman', role: 'flex-raider', characterName: 'Kol', spec: 'Resto  heals' },
    });
    expect(parseApplicationCustomId(applicationCustomId('nn', 'app-9'))).toEqual({
      action: 'nn',
      applicationId: 'app-9',
    });
    expect(parseApplicationCustomId('poll:v:1')).toBeNull();
    expect(parseApplicationCustomId('app:zz:1')).toBeNull();
  });

  it('shows labels and buttons while open, and only the outcome once closed', () => {
    const open = renderApplicationPost(
      sample({ labels: { role: 'raider', complete: true, fit: 3, labeledAt: NOW } }),
    );
    expect(JSON.stringify(open.embeds)).toMatch(/Reads as raider · complete · fit strong/);
    expect(open.components).toHaveLength(1);
    const closed = renderApplicationPost(sample({ status: 'accepted', reply: 'Welcome' }));
    expect(closed.components).toEqual([]);
    expect(JSON.stringify(closed.embeds)).toMatch(/Accepted · application app-1/);
    expect(labelsLine(null)).toMatch(/Not labeled/);
  });
});

describe('the recruiting post', () => {
  const needs = [{ wowClass: 'priest' as const, specs: 'holy', need: 'high' as const }];
  const text = (siteUrl: string | null) =>
    JSON.stringify(renderRecruitingPost('Two healers for the twenties.', needs, siteUrl));

  it('points to the website apply page when the site is known', () => {
    expect(text('https://vintageguild.gg/')).toContain('https://vintageguild.gg/apply');
    expect(text('https://vintageguild.gg//')).toContain('https://vintageguild.gg/apply');
    expect(text('https://vintageguild.gg')).toContain('https://vintageguild.gg/apply');
    expect(text('https://vintageguild.gg/')).toContain('/random apply');
  });

  it('points only to Discord without a site', () => {
    expect(text(null)).not.toContain('https://');
    expect(text(null)).not.toContain('on the site');
  });
});
