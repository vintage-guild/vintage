import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, NOT_CONNECTED, setCommandClient } from '../client';
import { cleanup, mount, settle } from '../test-helpers';
import type { VintageCharacterForm } from './character-form';
import './character-form';

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

async function filledForm() {
  const form = await mount<VintageCharacterForm>(
    '<vintage-character-form></vintage-character-form>',
  );
  form.setName('aeryn');
  form.setClass('paladin');
  form.setSpec('holy');
  await settle();
  return form;
}

const status = (form: Element) =>
  form.shadowRoot?.querySelector('[role="status"]')?.textContent?.trim();
const button = (form: Element) => form.shadowRoot?.querySelector('violet-button');

describe('vintage-character-form', () => {
  it('offers every class and only the chosen class’s specs', async () => {
    const form = await mount<VintageCharacterForm>(
      '<vintage-character-form></vintage-character-form>',
    );
    const [classSelect, specSelect] = form.shadowRoot!.querySelectorAll('violet-select');
    expect(classSelect!.querySelectorAll('violet-option')).toHaveLength(9);
    expect(specSelect!.hasAttribute('disabled')).toBe(true);

    form.setClass('druid');
    await settle();
    const specs = [...specSelect!.querySelectorAll('violet-option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(specs).toEqual(['balance', 'feral', 'feral-tank', 'restoration']);
    expect(specSelect!.hasAttribute('disabled')).toBe(false);
  });

  it('clears a spec that does not belong to the new class', async () => {
    const form = await filledForm();
    form.setClass('mage');
    expect(form.spec).toBe('');
    expect(form.input).toBeNull();
  });

  it('previews the class and role, and enables submit once complete', async () => {
    const form = await mount<VintageCharacterForm>(
      '<vintage-character-form></vintage-character-form>',
    );
    expect(form.addCharacterCanExecute).toBe(false);
    expect(button(form)?.hasAttribute('disabled')).toBe(true);

    form.setName('Aeryn');
    form.setClass('paladin');
    form.setSpec('holy');
    await settle();
    expect(form.addCharacterCanExecute).toBe(true);
    expect(button(form)?.hasAttribute('disabled')).toBe(false);
    expect(form.shadowRoot?.querySelector('vintage-role-badge')?.getAttribute('raid-role')).toBe(
      'healer',
    );
  });

  it('flags a bad name only after it is touched', async () => {
    const form = await mount<VintageCharacterForm>(
      '<vintage-character-form></vintage-character-form>',
    );
    expect(form.nameError).toBe('');
    form.setName('X1');
    expect(form.nameError).toMatch(/2–12 letters/);
    expect(form.input).toBeNull();
  });

  it('runs character-add through the command client and reports success', async () => {
    const client = useClient((_, input) => ({
      success: true,
      data: { id: 'c1', ...(input as object) },
      reasoning: 'Aeryn is your main',
    }));
    const form = await filledForm();
    const added = vi.fn();
    form.addEventListener('character-added', (e) => added((e as CustomEvent).detail));

    const result = await form.addCharacter();
    await settle();

    expect(client.run).toHaveBeenCalledWith('character-add', {
      name: 'aeryn',
      class: 'paladin',
      spec: 'holy',
      isMain: false,
    });
    expect(result.success).toBe(true);
    expect(added).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(status(form)).toBe('Aeryn is your main');
    expect(form.name).toBe('');
  });

  it('shows the server error with its suggestion and keeps the input', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'CHARACTER_EXISTS',
        message: 'Aeryn is already registered',
        suggestion: 'Ask an officer if someone else registered your character',
      },
    }));
    const form = await filledForm();
    const result = await form.addCharacter();
    await settle();

    expect(result.success).toBe(false);
    expect(status(form)).toBe(
      'Aeryn is already registered. Ask an officer if someone else registered your character.',
    );
    expect(form.name).toBe('aeryn');
  });

  it('says the site is not connected while the stub client is in place', async () => {
    const form = await filledForm();
    const result = await form.addCharacter();
    expect(result.success === false && result.error.code).toBe(NOT_CONNECTED);
  });

  it('refuses to run with an incomplete form', async () => {
    const client = useClient(() => ({ success: true }));
    const form = await mount<VintageCharacterForm>(
      '<vintage-character-form></vintage-character-form>',
    );
    const result = await form.addCharacter();
    expect(result.success === false && result.error.code).toBe('INVALID_PARAMETERS');
    expect(client.run).not.toHaveBeenCalled();
  });

  it('is the same command agents run through the FAST-AF registry', async () => {
    const client = useClient(() => ({ success: true, data: { id: 'c2' } }));
    const form = await filledForm();
    expect(CommandRegistry.get('vintage.character-add')?.canExecute).toBe(true);

    const result = await CommandRegistry.execute('vintage.character-add');
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledOnce();

    form.remove();
    expect(CommandRegistry.get('vintage.character-add')).toBeUndefined();
  });
});
