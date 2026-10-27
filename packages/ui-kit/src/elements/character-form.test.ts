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

  it('guesses the role from the spec, naming the guess, unless one is picked (#149)', async () => {
    const client = useClient((_, input) => ({
      success: true,
      data: { id: 'c3', ...(input as object) },
    }));
    const form = await mount<VintageCharacterForm>(
      '<vintage-character-form></vintage-character-form>',
    );
    const roleSelect = () =>
      [...form.shadowRoot!.querySelectorAll('violet-select')].find(
        (s) => s.getAttribute('label') === 'Role',
      )!;
    const firstOption = () => roleSelect().querySelector('violet-option')?.textContent?.trim();
    expect(firstOption()).toBe('Guess from spec');

    form.setName('Brakk');
    form.setClass('warrior');
    form.setSpec('fury');
    await settle();
    expect(firstOption()).toBe('Guess from spec (Melee DPS)');
    // With no pick, the closed select shows the guess, not Violet's "Select an option".
    expect(roleSelect().getAttribute('placeholder')).toBe('Guess from spec (Melee DPS)');
    expect(form.role).toBe('melee');
    expect(form.input).not.toHaveProperty('role');

    // A Fury warrior who tanks.
    form.setRole('tank');
    await settle();
    expect(form.shadowRoot?.querySelector('vintage-role-badge')?.getAttribute('raid-role')).toBe(
      'tank',
    );
    await form.addCharacter();
    expect(client.run).toHaveBeenCalledWith('character-add', {
      name: 'Brakk',
      class: 'warrior',
      spec: 'fury',
      role: 'tank',
      isMain: false,
    });
  });

  describe('editing (#149)', () => {
    const BRAKK = {
      id: 'c9',
      name: 'Brakk',
      class: 'warrior',
      spec: 'fury',
      role: 'tank',
      rolePicked: true,
      isMain: false,
    };
    const editing = async (character = BRAKK) => {
      const form = await mount<VintageCharacterForm>(
        '<vintage-character-form></vintage-character-form>',
      );
      form.character = { ...character };
      await settle();
      return form;
    };

    it('starts from the saved character and sends only what changed', async () => {
      const client = useClient((_, input) => ({ success: true, data: input }));
      const form = await editing();
      expect([form.name, form.wowClass, form.spec, form.rolePick]).toEqual([
        'Brakk',
        'warrior',
        'fury',
        'tank',
      ]);
      expect(form.saveCharacterCanExecute).toBe(false);
      expect(form.addCharacterCanExecute).toBe(false);

      form.setName('brakk stone');
      form.setSpec('arms');
      form.setMain(true);
      await settle();
      const saved = vi.fn();
      form.addEventListener('character-saved', (e) => saved((e as CustomEvent).detail));
      const result = await form.saveCharacter();
      expect(result.success).toBe(true);
      expect(client.run).toHaveBeenCalledWith('character-update', {
        characterId: 'c9',
        name: 'brakk stone',
        spec: 'arms',
        isMain: true,
      });
      expect(saved).toHaveBeenCalledOnce();
      // Saved: the form goes back to adding.
      expect(form.character).toBeNull();
      expect(form.name).toBe('');
    });

    it('sends role null to guess again, and a new class with its spec', async () => {
      const client = useClient((_, input) => ({ success: true, data: input }));
      const form = await editing();
      form.setRole('');
      await form.saveCharacter();
      expect(client.run).toHaveBeenLastCalledWith('character-update', {
        characterId: 'c9',
        role: null,
      });

      form.character = { ...BRAKK, rolePicked: false, role: 'melee' };
      form.setClass('paladin');
      expect(form.saveCharacterCanExecute).toBe(false);
      form.setSpec('protection');
      await form.saveCharacter();
      expect(client.run).toHaveBeenLastCalledWith('character-update', {
        characterId: 'c9',
        class: 'paladin',
        spec: 'protection',
      });

      // A picked role the form still shows goes with a class change: the server starts the
      // role over on a new class, so leaving it out would quietly drop the pick.
      form.character = { ...BRAKK };
      await settle();
      form.setClass('paladin');
      form.setSpec('retribution');
      await form.saveCharacter();
      expect(client.run).toHaveBeenLastCalledWith('character-update', {
        characterId: 'c9',
        class: 'paladin',
        spec: 'retribution',
        role: 'tank',
      });
    });

    it('cancel leaves the edit without saving', async () => {
      const client = useClient(() => ({ success: true }));
      const form = await editing();
      const cancelled = vi.fn();
      form.addEventListener('edit-cancelled', cancelled);
      form.setSpec('arms');
      form.cancelEdit();
      expect(cancelled).toHaveBeenCalledOnce();
      expect(form.character).toBeNull();
      expect(form.spec).toBe('');
      expect(client.run).not.toHaveBeenCalled();
    });

    it('shows a refusal and stays in the edit', async () => {
      useClient(() => ({
        success: false,
        error: { code: 'CHARACTER_EXISTS', message: 'Kol is already registered' },
      }));
      const form = await editing();
      form.setName('Kol');
      const result = await form.saveCharacter();
      await settle();
      expect(result.success).toBe(false);
      expect(status(form)).toMatch(/Kol is already registered/);
      expect(form.character?.id).toBe('c9');
    });
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
