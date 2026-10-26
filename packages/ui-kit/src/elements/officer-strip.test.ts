import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle } from '../test-helpers';
import type { VintageOfficerStrip } from './officer-strip';
import './officer-strip';

afterEach(cleanup);

const cell = (el: Element, part: string) =>
  el.shadowRoot!.querySelector(`[part="${part}"]`)!.textContent!.replace(/\s+/g, ' ').trim();

describe('vintage-officer-strip', () => {
  it('names who has not answered, the comp gaps, and the coordinator state', async () => {
    const el = await mount<VintageOfficerStrip>(
      '<vintage-officer-strip event-title="Launch night" state="running" state-detail="next: remind-24h"></vintage-officer-strip>',
    );
    el.waiting = ['Brannoch', 'Cadric', 'Elowen', 'Fenwick', 'Garrick', 'Isolde'];
    el.gaps = ['need 1 more healer', 'no Mark of the Wild'];
    await settle();
    expect(cell(el, 'waiting')).toBe('Waiting on 6 Brannoch, Cadric, Elowen, Fenwick +2 more');
    expect(cell(el, 'comp')).toBe('Comp 2 gaps need 1 more healer · no Mark of the Wild');
    expect(cell(el, 'coordinator')).toBe('Random running next: remind-24h');
    expect(el.shadowRoot!.querySelector('aside')?.getAttribute('aria-label')).toBe(
      'Officers: Launch night',
    );
    // No quarters yet: no link.
    expect(el.shadowRoot!.querySelector('a')).toBeNull();
  });

  it('says when everything is in hand, and flags a paused coordinator', async () => {
    const el = await mount<VintageOfficerStrip>(
      '<vintage-officer-strip state="paused" href="/officers"></vintage-officer-strip>',
    );
    expect(cell(el, 'waiting')).toBe('Waiting on 0 everyone expected has answered');
    expect(cell(el, 'comp')).toBe('Comp no gaps');
    expect(el.shadowRoot!.querySelector('[part="coordinator"] b')?.className).toBe('warn');
    expect(el.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('/officers');
  });

  it('falls back for a state it does not know', async () => {
    const el = await mount<VintageOfficerStrip>(
      '<vintage-officer-strip state="exploded"></vintage-officer-strip>',
    );
    expect(el.stateLabel).toBe('no status');
  });
});

describe('vintage-officer-strip while loading', () => {
  it('says it is checking instead of "0" or "no status", then shows the answer', async () => {
    const el = await mount<VintageOfficerStrip>(
      '<vintage-officer-strip loading state="unknown"></vintage-officer-strip>',
    );
    expect(cell(el, 'waiting')).toBe('Waiting on … checking');
    expect(cell(el, 'comp')).toBe('Comp …');
    expect(cell(el, 'coordinator')).toBe('Random …');
    el.loading = false;
    el.state = 'running';
    await settle();
    expect(cell(el, 'waiting')).toBe('Waiting on 0 everyone expected has answered');
    expect(cell(el, 'coordinator')).toBe('Random running');
  });
});
