import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { GuildProfileDeskProfile, VintageGuildProfileDesk } from './guild-profile-desk';
import './guild-profile-desk';

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

const PROFILE: GuildProfileDeskProfile = {
  pills: ['Normal ruleset', 'Wed + Thu · 8 pm ET'],
  intro: 'We raid.',
  aboutLead: 'A guild.',
  aboutSections: [
    { heading: 'Who we are', body: 'Old friends.' },
    { heading: 'Joining', body: 'Ask an officer.' },
  ],
  discordInvite: null,
  contactEmail: null,
  updatedAt: null,
};

async function desk(canEdit = true) {
  const el = await mount<VintageGuildProfileDesk>(
    `<vintage-guild-profile-desk ${canEdit ? 'can-edit' : ''}></vintage-guild-profile-desk>`,
  );
  el.profile = structuredClone(PROFILE);
  await settle();
  return el;
}

const $ = <T extends Element>(el: Element, selector: string) =>
  el.shadowRoot?.querySelector(selector) as T;
const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
};

describe('vintage-guild-profile-desk', () => {
  it('shows the profile: pills one per line, each About section, empty links', async () => {
    const el = await desk();
    expect($<HTMLTextAreaElement>(el, '#pills').value).toBe('Normal ruleset\nWed + Thu · 8 pm ET');
    expect($<HTMLTextAreaElement>(el, '#intro').value).toBe('We raid.');
    expect(el.shadowRoot?.querySelectorAll('.section')).toHaveLength(2);
    expect($<HTMLInputElement>(el, '#invite').value).toBe('');
    expect(shadowText(el)).toContain('Nobody has saved the profile yet');
  });

  it('saves every field, blank pill lines dropped and empty links as null', async () => {
    const client = useClient(() => ({ success: true, data: PROFILE }));
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('profile-changed', changed);
    await type($(el, '#pills'), 'Normal ruleset\n\n  Tue + Thu · 9 pm ET  \n');
    await type($(el, '#invite'), 'https://discord.gg/vintage');
    const sections = el.shadowRoot?.querySelectorAll('.section') ?? [];
    await type(sections[1]!.querySelector('textarea')!, 'Ask in Discord.');
    $<HTMLButtonElement>(el, '.section .remove').click();
    await settle();
    $<HTMLFormElement>(el, 'form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(client.run).toHaveBeenCalledWith('guild-profile-set', {
      pills: ['Normal ruleset', 'Tue + Thu · 9 pm ET'],
      intro: 'We raid.',
      aboutLead: 'A guild.',
      aboutSections: [{ heading: 'Joining', body: 'Ask in Discord.' }],
      discordInvite: 'https://discord.gg/vintage',
      contactEmail: null,
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it('adds sections up to six and keeps at least one', async () => {
    const el = await desk();
    const add = () =>
      [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find((b) =>
        b.textContent?.includes('Add a section'),
      ) as HTMLButtonElement;
    for (let i = 0; i < 6; i++) {
      add().click();
      await settle();
    }
    expect(el.sections).toHaveLength(6);
    expect(add().disabled).toBe(true);
    el.sections = [{ heading: 'Only', body: 'One' }];
    await settle();
    expect($<HTMLButtonElement>(el, '.section .remove').disabled).toBe(true);
  });

  it('shows why the read failed instead of a form, and is read-only for leaders', async () => {
    const failed = await mount<VintageGuildProfileDesk>(
      '<vintage-guild-profile-desk can-edit></vintage-guild-profile-desk>',
    );
    failed.error = 'The guild server doesn’t have the guild profile yet.';
    await settle();
    expect($(failed, '[part=error]')?.textContent).toContain('guild profile yet');
    expect($(failed, '#intro')).toBeNull();
    expect((await failed.save()).success).toBe(false);
    cleanup();

    const leader = await desk(false);
    expect($<HTMLTextAreaElement>(leader, '#intro').closest('fieldset')?.disabled).toBe(true);
    expect($(leader, 'button[type=submit]')).toBeNull();
    expect(shadowText(leader)).toContain('Officers edit the guild profile');
  });
});
