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

  it('shows each option with its share and marks my vote and the leader', async () => {
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" question="Sunday or Monday?" note="26 ballots"></vintage-poll-card>',
    );
    el.options = options;
    el.myVote = 'o2';
    await settle();
    expect(el.ballots).toBe(26);
    expect(el.percent(options[0]!)).toBe(54);
    const buttons = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.option')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(buttons[0]?.classList.contains('leading')).toBe(true);
    expect(shadowText(el)).toContain('Sunday 54% · 14');
  });

  it('votes through vote-cast, moves my vote, and announces it', async () => {
    const client = useClient(() => ({
      success: true,
      data: { id: 'v1', choices: ['o3'] },
      reasoning: 'Vote counted for Either',
    }));
    const el = await mount<VintagePollCard>('<vintage-poll-card poll-id="p1"></vintage-poll-card>');
    el.options = options.map((o) => ({ ...o }));
    el.myVote = 'o1';
    const seen: unknown[] = [];
    el.addEventListener('vote-cast', (e) => seen.push((e as CustomEvent).detail));

    const result = await el.vote('o3');
    await settle();
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledWith('vote-cast', { pollId: 'p1', choices: ['o3'] });
    expect(el.myVote).toBe('o3');
    expect(el.options.map((o) => o.votes)).toEqual([13, 9, 4]);
    expect(el.statusText).toBe('Vote counted for Either');
    expect(seen).toEqual([{ id: 'v1', choices: ['o3'] }]);
  });

  it('rejects an unknown option and a closed poll', async () => {
    useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>(
      '<vintage-poll-card poll-id="p1" readonly></vintage-poll-card>',
    );
    el.options = options;
    expect(await el.vote('nope')).toMatchObject({
      success: false,
      error: { code: 'INVALID_PARAMETERS' },
    });
    expect(await el.vote('o1')).toMatchObject({
      success: false,
      error: { code: 'COMMAND_DISABLED' },
    });
  });

  it('is reachable as vintage.vote-cast', async () => {
    const client = useClient(() => ({ success: true, data: null }));
    const el = await mount<VintagePollCard>('<vintage-poll-card poll-id="p1"></vintage-poll-card>');
    el.options = options;
    const result = await CommandRegistry.execute('vintage.vote-cast', 'o2');
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledTimes(1);
  });
});
