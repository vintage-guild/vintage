import type { CommandResult } from '@vintage/guild-kit';
import { CLASS_NAMES } from '@vintage/wow-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { RecruitingDeskBand, VintageRecruitingDesk } from './recruiting-desk';
import './recruiting-desk';

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

const BAND: RecruitingDeskBand = {
  headline: 'Tanks wanted',
  pitch: 'Be kind.',
  needs: [
    { wowClass: 'mage', role: 'ranged', specs: 'any', need: 'medium' },
    { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'high' },
  ],
  updatedAt: null,
};

async function desk(canEdit = true) {
  const el = await mount<VintageRecruitingDesk>(
    `<vintage-recruiting-desk ${canEdit ? 'can-edit' : ''}></vintage-recruiting-desk>`,
  );
  el.recruiting = structuredClone(BAND);
  await settle();
  return el;
}

const $ = <T extends Element>(el: Element, selector: string) =>
  el.shadowRoot?.querySelector(selector) as T;
const rows = (el: Element) => [...(el.shadowRoot?.querySelectorAll('.rows .row') ?? [])];
const pick = (row: Element, cls: string, value: string) => {
  const select = row.querySelector(`select.${cls}`) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
};
const type = (row: Element, value: string) => {
  const input = row.querySelector('input.specs') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
/** Each line as class:role:specs:demand, the way the form shows it. */
const lines = (el: Element) =>
  rows(el).map((r) =>
    ['select.cls', 'select.role', 'input.specs', 'select.need']
      .map((s) => (r.querySelector(s) as HTMLInputElement | HTMLSelectElement).value)
      .join(':'),
  );
const button = (el: Element, label: string) =>
  [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;

describe('vintage-recruiting-desk', () => {
  it('shows the band’s lines, every field editable, and that nobody has saved it yet', async () => {
    const el = await desk();
    expect($<HTMLInputElement>(el, '#headline').value).toBe('Tanks wanted');
    expect($<HTMLTextAreaElement>(el, '#pitch').value).toBe('Be kind.');
    expect(lines(el)).toEqual(['mage:ranged:any:medium', 'warrior:tank:protection:high']);
    const classes = [...rows(el)[0]!.querySelectorAll<HTMLOptionElement>('select.cls option')];
    expect(classes.map((o) => o.value)).toEqual([...CLASS_NAMES]);
    expect(shadowText(el)).toContain('Nobody has saved the band yet');
  });

  it('offers only the roles a class plays, and resets a role the new class can’t play', async () => {
    const el = await desk();
    const roles = (row: Element) =>
      [...row.querySelectorAll<HTMLOptionElement>('select.role option')]
        .filter((o) => !o.disabled && !o.hidden)
        .map((o) => o.value);
    expect(roles(rows(el)[0]!)).toEqual(['any', 'ranged']);
    expect(roles(rows(el)[1]!)).toEqual(['any', 'tank', 'melee']);

    pick(rows(el)[1]!, 'cls', 'druid'); // a druid tanks too: the role stays
    await settle();
    expect(lines(el)[1]).toBe('druid:tank:protection:high');
    expect(roles(rows(el)[1]!)).toEqual(['any', 'tank', 'healer', 'melee', 'ranged']);

    pick(rows(el)[1]!, 'cls', 'priest'); // a priest doesn't: back to any
    await settle();
    expect(lines(el)[1]).toBe('priest:any:protection:high');
  });

  it('adds and removes lines, and saves them high first with every field', async () => {
    const client = useClient(() => ({ success: true, data: BAND }));
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('recruiting-changed', changed);
    const save = $<HTMLButtonElement>(el, 'button[type=submit]');
    expect(save.disabled).toBe(true);

    // Two druid lines: healers wanted most, a tank a little.
    button(el, 'Add a line').click();
    await settle();
    pick(rows(el)[2]!, 'cls', 'druid');
    await settle();
    pick(rows(el)[2]!, 'role', 'healer');
    type(rows(el)[2]!, ' restoration ');
    button(el, 'Add a line').click();
    await settle();
    pick(rows(el)[3]!, 'cls', 'druid');
    await settle();
    pick(rows(el)[3]!, 'role', 'tank');
    pick(rows(el)[3]!, 'need', 'low');
    // And mages are off the list.
    (rows(el)[0]!.querySelector('button.remove') as HTMLButtonElement).click();
    await settle();
    expect(save.disabled).toBe(false);

    $<HTMLFormElement>(el, 'form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(client.run).toHaveBeenCalledWith('recruiting-set', {
      headline: 'Tanks wanted',
      pitch: 'Be kind.',
      needs: [
        { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'high' },
        { wowClass: 'druid', role: 'healer', specs: 'restoration', need: 'high' },
        { wowClass: 'druid', role: 'tank', specs: 'any', need: 'low' },
      ],
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(shadowText(el)).toContain('Saved. The Recruitment page shows it now.');
  });

  it('says nothing is listed once every line is removed', async () => {
    const el = await desk();
    for (const row of rows(el)) (row.querySelector('button.remove') as HTMLButtonElement).click();
    await settle();
    expect(rows(el)).toHaveLength(0);
    expect(shadowText(el)).toContain('Nothing listed');
  });

  it('says why a save was refused', async () => {
    useClient(() => ({
      success: false,
      error: { code: 'DUPLICATE_CLASS', message: 'mage is listed twice', suggestion: 'One row' },
    }));
    const el = await desk();
    $<HTMLInputElement>(el, '#headline').value = 'New';
    $<HTMLInputElement>(el, '#headline').dispatchEvent(new Event('input'));
    await el.save();
    await settle();
    expect(shadowText(el)).toContain('mage is listed twice. One row.');
  });

  it('is read-only without can-edit, for leaders', async () => {
    const el = await desk(false);
    expect($<HTMLInputElement>(el, '#headline').disabled).toBe(true);
    expect($<HTMLFieldSetElement>(el, 'fieldset').disabled).toBe(true);
    expect($(el, 'button[type=submit]')).toBeNull();
    expect(shadowText(el)).toContain('Officers edit the recruiting band');
    const result = await el.save();
    expect(result.success).toBe(false);
  });
});

describe('vintage-recruiting-desk after a save re-sorts the band', () => {
  it('shows each line with its own values, not the ones typed into the line it replaced', async () => {
    useClient(() => ({ success: true, data: BAND }));
    const el = await desk();
    pick(rows(el)[0]!, 'need', 'closed');
    type(rows(el)[0]!, 'arcane');
    await settle();

    // The page re-reads: warrior now leads, mage moved down.
    el.recruiting = {
      ...BAND,
      needs: [
        { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'high' },
        { wowClass: 'mage', role: 'ranged', specs: 'arcane', need: 'closed' },
      ],
    };
    await settle();
    expect(lines(el)).toEqual(['warrior:tank:protection:high', 'mage:ranged:arcane:closed']);
  });
});

describe('vintage-recruiting-desk without a band', () => {
  it('shows why the read failed instead of an empty form, and refuses to save', async () => {
    const client = useClient(() => ({ success: true }));
    const el = await mount<VintageRecruitingDesk>(
      '<vintage-recruiting-desk can-edit></vintage-recruiting-desk>',
    );
    expect(shadowText(el)).toContain('Loading the band');
    expect($(el, '#headline')).toBeNull();

    el.error = 'The guild server doesn’t have the recruiting band yet.';
    await settle();
    expect($(el, '[part=error]')?.textContent).toContain('recruiting band yet');
    expect($(el, '#headline')).toBeNull();
    expect(rows(el)).toHaveLength(0);
    expect($(el, 'button[type=submit]')).toBeNull();
    expect(shadowText(el)).not.toContain('Loading the band');
    expect((await el.save()).success).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
  });
});
