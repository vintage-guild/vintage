import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import { instantFromInputs } from '../zoned';
import type { LedgerRaid } from './boss-ledger';
import { MAX_DROPS, type VintageProgressDesk } from './progress-desk';
import './progress-desk';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(
  run: (name: string, input: unknown) => CommandResult = () => ({
    success: true,
    data: { kill: { killedAt: 1 }, first: true },
  }),
) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => run(name, input)) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const ZONE = 'America/New_York';
const DEC_12 = Date.UTC(2026, 11, 13, 2, 40); // Sat Dec 12, 9:40 pm Eastern

const boss = (id: string, name: string, firstKillAt: number | null = null, datamined = true) => ({
  id,
  name,
  datamined,
  firstKillAt,
  loot: [],
});

const RAIDS: LedgerRaid[] = [
  {
    id: 'barrow-deeps',
    name: 'Barrow Deeps',
    size: 10,
    bosses: [
      boss('chillhowl', 'Chillhowl', DEC_12),
      boss('elder-tangleclaw', 'Elder Tangleclaw'),
      boss('khalith', 'Khalith the Dreadspinner'),
    ],
  },
  {
    id: 'onyxias-lair',
    name: "Onyxia's Lair",
    size: 40,
    bosses: [boss('onyxia', 'Onyxia', null, false)],
  },
];

async function desk(opts: { open?: boolean; record?: boolean } = {}) {
  const flags = [opts.open === false ? '' : 'open', opts.record === false ? '' : 'can-record'];
  const el = await mount<VintageProgressDesk>(
    `<vintage-progress-desk time-zone="${ZONE}" opens-on="2026-12-09" ${flags.join(' ')}></vintage-progress-desk>`,
  );
  el.raids = RAIDS;
  await settle();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: Element, s: string) =>
  el.shadowRoot?.querySelector(s) as T;
const $$ = (el: Element, s: string) => [...(el.shadowRoot?.querySelectorAll(s) ?? [])];
const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (el: Element, label: string) =>
  $$(el, 'button').find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const choose = (select: HTMLSelectElement, value: string) => {
  select.value = value;
  select.dispatchEvent(new Event('change'));
};

describe('vintage-progress-desk', () => {
  it('says when the raids unlock and keeps the form closed until then', async () => {
    const client = useClient();
    const el = await desk({ open: false });
    expect(text($(el, '#h-progress'))).toBe('The raids unlock December 9');
    expect(shadowText(el)).toContain('Kills can be recorded from December 9');
    expect($<HTMLFieldSetElement>(el, '.record fieldset').disabled).toBe(true);
    expect(button(el, 'Record the kill')?.disabled).toBe(true);
    expect($$(el, '#boss option').map(text)[1]).toBe('2. Elder Tangleclaw'); // no "next" until open
    expect((await el.record()).success).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
  });

  it('counts bosses down and starts on the next target', async () => {
    const el = await desk();
    expect(text($(el, '#h-progress'))).toBe('1 of 4 bosses down');
    expect(text($(el, '.head .meta'))).toBe("Barrow Deeps 1/3 · Onyxia's Lair 0/1");
    expect($<HTMLSelectElement>(el, '#boss').value).toBe('elder-tangleclaw');
    const options = $$(el, '#boss option').map(text);
    expect(options[0]).toBe('1. Chillhowl · down Dec 12');
    expect(options[1]).toBe('2. Elder Tangleclaw · next');
    choose($<HTMLSelectElement>(el, '#raid'), 'onyxias-lair');
    await settle();
    expect(el.bossId).toBe('onyxia');
    expect(shadowText(el)).not.toContain('beta client;');
  });

  it('keeps a boss the officer picked when the ledger reads again', async () => {
    const el = await desk();
    choose($<HTMLSelectElement>(el, '#boss'), 'khalith');
    el.raids = RAIDS.map((r) => ({ ...r }));
    await settle();
    expect(el.bossId).toBe('khalith');
  });

  it('records the kill the form shows, in the officer’s zone, without empty drops', async () => {
    const client = useClient();
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('progress-changed', changed);
    typeInto($<HTMLInputElement>(el, '#date'), '2026-12-16');
    typeInto($<HTMLInputElement>(el, '#time'), '22:05');
    button(el, 'Add a drop')?.click();
    button(el, 'Add a drop')?.click();
    await settle();
    const [name] = $$(el, '.drop input') as HTMLInputElement[];
    typeInto(name!, '  Frostbitten Girdle ');
    choose($$(el, '.drop select')[0] as HTMLSelectElement, 'rare');
    typeInto($<HTMLInputElement>(el, '#note'), 'Two-healed it');
    await settle();
    expect(text($(el, '.summary'))).toContain('Records Elder Tangleclaw in Barrow Deeps');
    expect(text($(el, '.summary'))).toContain('with 1 drop.');
    expect(text($(el, '.summary'))).toContain('first kill of Elder Tangleclaw');
    button(el, 'Record the kill')?.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(client.run).toHaveBeenCalledWith('kill-record', {
      raidId: 'barrow-deeps',
      bossId: 'elder-tangleclaw',
      killedAt: instantFromInputs('2026-12-16', '22:05', ZONE),
      loot: [{ name: 'Frostbitten Girdle', quality: 'rare' }],
      note: 'Two-healed it',
    });
    await settle();
    expect(text($(el, '.status'))).toBe(
      'First kill of Elder Tangleclaw in Barrow Deeps. It’s on the ledger.',
    );
    expect(el.drops).toHaveLength(0);
  });

  it('says a repeat kill leaves the first one on the ledger', async () => {
    useClient(() => ({ success: true, data: { kill: { killedAt: 2 }, first: false } }));
    const el = await desk();
    choose($<HTMLSelectElement>(el, '#boss'), 'chillhowl');
    typeInto($<HTMLInputElement>(el, '#date'), '2026-12-19');
    await settle();
    expect(text($(el, '.summary'))).toContain(
      'Chillhowl is already down; the first kill (Dec 12) stays',
    );
    typeInto($<HTMLInputElement>(el, '#date'), '2026-12-10');
    await settle();
    expect(text($(el, '.summary'))).toContain('earlier than the first kill on record (Dec 12)');
    typeInto($<HTMLInputElement>(el, '#date'), '2026-12-19');
    await el.record();
    await settle();
    expect(text($(el, '.status'))).toBe(
      'Chillhowl again. The first kill (Dec 12) stays on the ledger.',
    );
  });

  it('shows the server’s refusal and refuses a bad date itself', async () => {
    const client = useClient(() => ({
      success: false,
      error: {
        code: 'INVALID_TIME',
        message: 'That kill is in the future',
        suggestion: 'Record kills after they happen',
      },
    }));
    const el = await desk();
    expect((await el.record()).success).toBe(false);
    await settle();
    expect(text($(el, '.status'))).toBe(
      'That kill is in the future. Record kills after they happen.',
    );
    typeInto($<HTMLInputElement>(el, '#time'), '');
    await el.record();
    await settle();
    expect(text($(el, '.status'))).toBe('Give the date and time it died.');
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it('stops adding drops at the command’s limit', async () => {
    const el = await desk();
    for (let i = 0; i < MAX_DROPS + 2; i++) el.addDrop();
    await settle();
    expect($$(el, '.drop')).toHaveLength(MAX_DROPS);
    expect(button(el, 'Add a drop')?.disabled).toBe(true);
  });

  it('shows the ledger without the form to a caller who can’t record', async () => {
    const client = useClient();
    const el = await desk({ record: false });
    expect($(el, 'form')).toBeNull();
    expect($(el, 'vintage-boss-ledger')).toBeTruthy();
    expect(shadowText(el)).toContain('Raid leaders and officers record kills.');
    expect((await el.record()).success).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
  });
});
