import {
  type ApplicationCommandOption,
  ApplicationCommandOptionType as T,
} from '@vintage/discord-kit';
import { FORWARDED_GROUPS, RANDOM_COMMAND } from '@vintage/gateway/commands';
import { type Caller, publicCaller, type Tier } from '@vintage/guild-kit';
import { fixedClock, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import {
  type HelpContext,
  type HelpPage,
  parseExample,
  renderHelp,
  slashLeaves,
  topicByKey,
} from '../src/help';
import { HELP_TOPICS } from '../src/help-topics';
import { commands, type VintageDeps } from '../src/registry';

const GUILD = 'guild-test';
const tiers = new Map(commands.map((c) => [c.name, c.tier as Tier]));
const ctx = (tier: Tier, siteUrl: string | null = null): HelpContext => ({
  tier,
  tierOf: (name) => tiers.get(name),
  siteUrl,
});
const as = (tier: Tier): Caller => ({ surface: 'discord', guildId: GUILD, tier, memberId: 'm1' });

// The drift gate: the definitions Discord registers and the help pages can't come apart.
describe('help drift', () => {
  const forwarded = slashLeaves().filter((l) =>
    FORWARDED_GROUPS.has(l.path.split(' ')[0] as string),
  );
  const covered = HELP_TOPICS.flatMap((t) => Object.keys(t.runs));

  it('every forwarded subcommand has a help topic', () => {
    expect(forwarded.length).toBeGreaterThan(0);
    for (const leaf of forwarded) expect(covered, `/random ${leaf.path}`).toContain(leaf.path);
  });

  it('every forwarded subcommand has an example, and every topic two or more', () => {
    const exampled = new Set(
      HELP_TOPICS.flatMap((t) => t.examples)
        .map((e) => parseExample(e))
        .flatMap((p) => ('leaf' in p ? [p.leaf.path] : [])),
    );
    for (const leaf of forwarded)
      expect([...exampled], `/random ${leaf.path}`).toContain(leaf.path);
    for (const topic of HELP_TOPICS) {
      expect(topic.examples.length, topic.key).toBeGreaterThanOrEqual(2);
    }
  });

  it('every /random example still parses against the definitions', () => {
    for (const example of HELP_TOPICS.flatMap((t) => t.examples)) {
      if (!example.startsWith('/')) continue;
      expect(parseExample(example), example).not.toHaveProperty('problem');
    }
  });

  it('each topic names real subcommands and real guild commands', () => {
    const paths = slashLeaves().map((l) => l.path);
    for (const topic of HELP_TOPICS) {
      for (const [path, command] of Object.entries(topic.runs)) {
        expect(paths, topic.key).toContain(path);
        expect(tiers.has(command), command).toBe(true);
      }
      for (const b of topic.buttons ?? []) expect(tiers.has(b.command), b.command).toBe(true);
    }
  });

  it('/random help offers every topic, and every group is forwarded and has its own help', () => {
    const top: readonly ApplicationCommandOption[] = RANDOM_COMMAND.options;
    const help = top.find((o) => o.name === 'help');
    const choices = help?.options?.find((o) => o.name === 'topic')?.choices ?? [];
    expect(choices.map((c) => c.value)).toEqual(HELP_TOPICS.map((t) => t.key));
    for (const group of top.filter((o) => o.type === T.SUB_COMMAND_GROUP)) {
      expect(FORWARDED_GROUPS.has(group.name), group.name).toBe(true);
      expect(
        group.options?.map((o) => o.name),
        group.name,
      ).toContain('help');
      expect(
        HELP_TOPICS.some((t) => t.group === group.name),
        group.name,
      ).toBe(true);
    }
  });
});

describe('parseExample', () => {
  it('reads options whose values hold spaces and times', () => {
    const parsed = parseExample(
      '/random event pick-night name:ZG run instance:Zul’Gurub size:20 times:2026-11-10 20:00; 2026-11-12 8pm',
    );
    expect(parsed).toMatchObject({
      leaf: { path: 'event pick-night' },
      values: { name: 'ZG run', size: '20', times: '2026-11-10 20:00; 2026-11-12 8pm' },
    });
  });

  it('names what no longer fits', () => {
    expect(
      parseExample('/random event create name:X instance:Y size:50 start:2026-11-10 8pm'),
    ).toEqual({ problem: 'event create: size is above the maximum' });
    expect(parseExample('/random poll create question:Which night?')).toEqual({
      problem: 'poll create: options is required',
    });
    expect(parseExample('/random event start name:X')).toEqual({
      problem: 'no subcommand event start',
    });
    expect(
      parseExample(
        '/random event create name:X instance:Y size:40 start:2026-11-10 8pm duration:4',
      ),
    ).toEqual({
      problem: 'event create: text before the first option, or an option it does not have',
    });
    expect(parseExample('/random poll create oops question:Q options:A; B')).toHaveProperty(
      'problem',
    );
  });
});

describe('help pages', () => {
  it('a raider sees how to sign up, and one line on who makes events', () => {
    const page = renderHelp('events', ctx('raider'));
    expect(page.text).not.toContain('`/random event create` ·');
    expect(page.text).toContain('Your rank can’t use these yet.');
    expect(page.text).toContain(
      '-# Raid leaders and officers can: `/random event create`, `/random event pick-night`.',
    );
    expect(page.text).not.toContain('**Examples**');
  });

  it('a raid leader sees the event commands with their options and examples', () => {
    const page = renderHelp('events', ctx('leader'));
    expect(page.text).toContain(
      '**`/random event create`** · Make a one-off event, open for signups',
    );
    expect(page.text).toContain(
      '• `kind` · Raid / Dungeon / Battleground / Other · What kind of event (default raid)',
    );
    expect(page.text).toContain('• `hours` · 0.5–8 · How long it runs, in hours (default 3)');
    expect(page.text).toContain('**Examples**');
    expect(page.text).not.toContain('can:');
  });

  it('the overview says what each rank can do and links the site', () => {
    const page = renderHelp(undefined, ctx('raider', 'https://vintage.test'));
    expect(page.title).toBe('Random help');
    expect(page.text).toContain('You can use `/random poll create`.');
    expect(page.text).toContain('-# Raid leaders and officers can: `/random event create`');
    expect(page.url).toBe('https://vintage.test');
  });

  it('a topic with a site page links it', () => {
    const page = renderHelp('polls', ctx('raider', 'https://vintage.test'));
    expect(page.url).toBe('https://vintage.test/polls');
    expect(page.text).toContain('On the website: https://vintage.test/polls');
  });

  it('every page fits one Discord embed and one screen, for every tier', () => {
    const keys = [undefined, ...HELP_TOPICS.map((t) => t.key)];
    for (const tier of ['public', 'member', 'raider', 'leader', 'officer'] as const) {
      for (const key of keys) {
        const page = renderHelp(key, ctx(tier, 'https://vintage.test'));
        expect(page.text.length, `${tier} ${key}`).toBeLessThanOrEqual(4096);
        expect(page.text.split('\n').length, `${tier} ${key}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it('knows every topic by key', () => {
    for (const topic of HELP_TOPICS) expect(topicByKey(topic.key)).toBe(topic);
  });
});

describe('help-get', () => {
  const registry = testRegistry<VintageDeps>(commands, fixedClock(0));
  const run = (caller: Caller, input: unknown) =>
    registry.execute({ name: 'help-get', input, caller }, {} as VintageDeps);

  it('answers anyone, for their own tier', async () => {
    const anyone = await run(publicCaller(GUILD, 'discord'), {});
    expect(anyone.success).toBe(true);
    const leader = await run(as('leader'), { topic: 'events' });
    expect((leader.data as HelpPage).text).toContain('**`/random event create`**');
    const raider = await run(as('raider'), { topic: 'events' });
    expect((raider.data as HelpPage).text).not.toContain('**`/random event create`**');
  });

  it('refuses a topic that does not exist', async () => {
    const result = await run(as('raider'), { topic: 'loot' });
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
