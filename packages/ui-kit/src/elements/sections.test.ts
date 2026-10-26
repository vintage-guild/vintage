import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageMemberMenu } from './member-menu';
import './member-menu';
import type { VintagePollCard } from './poll-card';
import './poll-card';
import type { VintageRosterWall } from './roster-wall';
import './roster-wall';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(run: (name: string, input: unknown) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => run(name, input)) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

describe('vintage-member-menu', () => {
  it('shows the initial without an avatar, and the image with one', async () => {
    const el = await mount<VintageMemberMenu>(
      '<vintage-member-menu name="Bloodfen" detail="Flex raider"></vintage-member-menu>',
    );
    expect(shadowText(el)).toBe('B Bloodfen Flex raider Profile Characters');
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    el.avatarSrc = 'data:image/svg+xml;utf8,<svg/>';
    await settle();
    expect(el.shadowRoot!.querySelector('img')?.getAttribute('alt')).toBe('');
    const links = [...el.shadowRoot!.querySelectorAll('.panel a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/profile', '/characters']);
  });

  it('stays hidden while the shell marks it hidden (signed out)', async () => {
    const el = await mount<VintageMemberMenu>('<vintage-member-menu hidden></vintage-member-menu>');
    expect(getComputedStyle(el).display).toBe('none');
  });
});

describe('vintage-roster-wall', () => {
  it('groups members by rank in order, colors mains by class, and marks me', async () => {
    const el = await mount<VintageRosterWall>(
      '<vintage-roster-wall me="m2"></vintage-roster-wall>',
    );
    el.members = [
      {
        id: 'm1',
        displayName: 'Stridulent',
        rank: 'officer',
        main: { name: 'Stridulent', class: 'warrior', spec: 'protection', role: 'tank' },
      },
      {
        id: 'm2',
        displayName: 'Bloodfen',
        rank: 'flex-raider',
        main: { name: 'Bloodfen Il', class: 'warrior', spec: 'protection', role: 'tank' },
      },
      { id: 'm3', displayName: 'Aeryn', rank: 'officer', main: null },
    ];
    await settle();
    expect(el.groups.map((g) => [g.label, g.members.map((m) => m.displayName)])).toEqual([
      ['Officers', ['Aeryn', 'Stridulent']],
      ['Flex raiders', ['Bloodfen']],
    ]);
    const you = el.shadowRoot!.querySelector('li.you')!;
    expect(you.textContent).toContain('Bloodfen Il');
    expect(you.querySelector('.name')?.getAttribute('style')).toBe(
      'color: var(--color-class-warrior)',
    );
    expect(shadowText(el)).toContain('no character yet');
  });
});

describe('vintage-poll-card', () => {
  const options = [
    { id: 'o1', label: 'Sunday', votes: 14 },
    { id: 'o2', label: 'Monday', votes: 9 },
    { id: 'o3', label: 'Either', votes: 3 },
  ];
  const rows = (el: VintagePollCard) => [
    ...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.option'),
  ];
  const actions = (el: VintagePollCard) =>
    [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.actions .btn')].map((b) =>
      b.textContent?.trim(),
    );

  it('shows each option with its share and marks my vote and the leader', async () => {
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" question="Sunday or Monday?" note="26 ballots"></vintage-poll-card>',
    );
    el.options = options;
    el.myChoices = ['o2'];
    await settle();
    expect(el.total).toBe(26);
    expect(el.percent(options[0]!)).toBe(54);
    expect(rows(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(rows(el)[0]?.classList.contains('leading')).toBe(true);
    expect(shadowText(el)).toContain('Sunday 54% · 14');
    expect(actions(el)).toEqual(['Take back my vote']);
  });

  it('hides counts, shares, and the leader while the poll keeps its tally', async () => {
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" results-hidden></vintage-poll-card>',
    );
    el.options = options.map((o) => ({ ...o, votes: 0 }));
    await settle();
    expect(shadowText(el)).not.toContain('%');
    expect(el.shadowRoot!.querySelector('.track')).toBeNull();
    expect(rows(el).some((b) => b.classList.contains('leading'))).toBe(false);
  });

  it('votes a pick-one poll on a click, and leaves the counts to the page', async () => {
    const client = useClient(() => ({
      success: true,
      data: { pollId: 'p1', choices: ['o3'] },
      reasoning: 'You voted for Either',
    }));
    const el = await mount<VintagePollCard>('<vintage-poll-card poll-id="p1"></vintage-poll-card>');
    el.options = options.map((o) => ({ ...o }));
    el.myChoices = ['o1'];
    const seen: unknown[] = [];
    el.addEventListener('vote-cast', (e) => seen.push((e as CustomEvent).detail));

    el.choose('o3');
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(client.run).toHaveBeenCalledWith('vote-cast', { pollId: 'p1', choices: ['o3'] });
    expect(el.myChoices).toEqual(['o3']);
    expect(el.options.map((o) => o.votes)).toEqual([14, 9, 3]);
    expect(el.statusText).toBe('You voted for Either');
  });

  it('collects a pick-any draft up to the limit, then votes it', async () => {
    const client = useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" method="multi" max-choices="2"></vintage-poll-card>',
    );
    el.options = options;
    await settle();
    expect(shadowText(el)).toContain('Pick up to 2, then vote.');
    el.choose('o1');
    el.choose('o3');
    el.choose('o2');
    expect(el.draft).toEqual(['o1', 'o3']);
    expect(el.statusText).toBe('Pick at most 2');
    el.choose('o1');
    expect(el.draft).toEqual(['o3']);
    await el.vote(el.draft);
    expect(client.run).toHaveBeenCalledWith('vote-cast', { pollId: 'p1', choices: ['o3'] });
    expect(el.draft).toEqual([]);
  });

  it('treats an empty pick limit as any number, not zero', async () => {
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" method="multi" max-choices=""></vintage-poll-card>',
    );
    el.options = options;
    el.choose('o1');
    el.choose('o2');
    el.choose('o3');
    expect(el.draft).toEqual(['o1', 'o2', 'o3']);
    expect(el.instruction).toBe('Pick any, then vote.');
  });

  it('ranks a ranked poll in click order and shows the numbers', async () => {
    const client = useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" method="ranked"></vintage-poll-card>',
    );
    el.options = options;
    el.choose('o3');
    el.choose('o1');
    await settle();
    expect(el.rankOf('o3')).toBe(1);
    expect(el.rankOf('o1')).toBe(2);
    expect(el.rankOf('o2')).toBe(0);
    expect([...el.shadowRoot!.querySelectorAll('.rank')].map((r) => r.textContent)).toEqual([
      '2',
      '1',
    ]);
    await el.vote(el.draft);
    expect(client.run).toHaveBeenCalledWith('vote-cast', { pollId: 'p1', choices: ['o3', 'o1'] });
  });

  it('takes a vote back through vote-retract', async () => {
    const client = useClient(() => ({ success: true, data: { retracted: true } }));
    const el = await mount<VintagePollCard>('<vintage-poll-card poll-id="p1"></vintage-poll-card>');
    el.options = options;
    el.myChoices = ['o1'];
    const seen: string[] = [];
    el.addEventListener('vote-retract', () => seen.push('retract'));
    expect((await el.retract()).success).toBe(true);
    expect(client.run).toHaveBeenCalledWith('vote-retract', { pollId: 'p1' });
    expect(el.myChoices).toEqual([]);
    expect(seen).toEqual(['retract']);
  });

  it('marks the winner of a closed poll and offers no actions', async () => {
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" readonly></vintage-poll-card>',
    );
    el.options = options;
    el.myChoices = ['o1'];
    el.winners = ['o1'];
    await settle();
    expect(shadowText(el)).toContain('Sunday ✓');
    expect(el.shadowRoot!.querySelector('.actions')).toBeNull();
  });

  it('rejects unknown options and a closed poll', async () => {
    useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" readonly></vintage-poll-card>',
    );
    el.options = options;
    expect(await el.vote(['nope'])).toMatchObject({
      success: false,
      error: { code: 'INVALID_PARAMETERS' },
    });
    expect(await el.vote(['o1'])).toMatchObject({
      success: false,
      error: { code: 'COMMAND_DISABLED' },
    });
  });

  it('is reachable as vintage.vote-cast, with a list or a single option id', async () => {
    const client = useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>('<vintage-poll-card poll-id="p1"></vintage-poll-card>');
    el.options = options;
    expect((await CommandRegistry.execute('vintage.vote-cast', ['o2'])).success).toBe(true);
    expect((await CommandRegistry.execute('vintage.vote-cast', 'o1')).success).toBe(true);
    expect(client.run).toHaveBeenCalledTimes(2);
  });
});
