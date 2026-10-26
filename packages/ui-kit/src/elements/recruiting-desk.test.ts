import type { CommandResult } from '@vintage/guild-kit';
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
    { wowClass: 'mage', specs: 'any', need: 'medium' },
    { wowClass: 'warrior', specs: 'protection', need: 'high' },
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
const rows = (el: Element) => [...(el.shadowRoot?.querySelectorAll('.row') ?? [])];

describe('vintage-recruiting-desk', () => {
  it('shows the band, every class, and that nobody has saved it yet', async () => {
    const el = await desk();
    expect($<HTMLInputElement>(el, '#headline').value).toBe('Tanks wanted');
    expect($<HTMLTextAreaElement>(el, '#pitch').value).toBe('Be kind.');
    expect(rows(el)).toHaveLength(9);
    expect(rows(el)[0]?.textContent).toContain('Mage');
    expect(rows(el)[0]?.querySelector('select')?.value).toBe('medium');
    expect(rows(el)[2]?.querySelector('select')?.value).toBe('none');
    expect(shadowText(el)).toContain('Nobody has saved the band yet');
  });

  it('saves listed classes high first and leaves out the ones not listed', async () => {
    const client = useClient(() => ({ success: true, data: BAND }));
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('recruiting-changed', changed);
    const save = $<HTMLButtonElement>(el, 'button[type=submit]');
    expect(save.disabled).toBe(true);

    const druid = rows(el).find((r) => r.textContent?.includes('Druid'))!;
    const need = druid.querySelector('select')!;
    need.value = 'closed';
    need.dispatchEvent(new Event('change'));
    const specs = druid.querySelector('input')!;
    specs.value = ' feral tank ';
    specs.dispatchEvent(new Event('input'));
    await settle();
    expect(save.disabled).toBe(false);

    $<HTMLFormElement>(el, 'form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(client.run).toHaveBeenCalledWith('recruiting-set', {
      headline: 'Tanks wanted',
      pitch: 'Be kind.',
      needs: [
        { wowClass: 'warrior', specs: 'protection', need: 'high' },
        { wowClass: 'mage', specs: 'any', need: 'medium' },
        { wowClass: 'druid', specs: 'feral tank', need: 'closed' },
      ],
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(shadowText(el)).toContain('Saved');
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
    expect($(el, 'button[type=submit]')).toBeNull();
    expect(shadowText(el)).toContain('Officers edit the recruiting band');
    const result = await el.save();
    expect(result.success).toBe(false);
  });
});
