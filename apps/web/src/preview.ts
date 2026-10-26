// "Preview as": leaders and officers see the site the way a lower tier does, on live data, so
// they can check what a change looks like to visitors, members, or raiders. The page composes
// for the previewed tier (src/session.ts), reads above it answer as the server would, and every
// action is refused so nothing is saved by someone looking through another tier's eyes.

import type { CommandResult, Tier } from '@vintage/guild-kit';
import { type CommandClient, getCommandClient, setCommandClient } from '@vintage/ui-kit';
import {
  canPreviewAs,
  currentPreview,
  PREVIEW_TIERS,
  type PreviewTier,
  realSession,
  setPreview,
} from './session';

const PARAM = 'preview';
const STORAGE_KEY = 'vintage-preview';

const isPreviewTier = (value: string | null | undefined): value is PreviewTier =>
  value != null && Object.hasOwn(PREVIEW_TIERS, value);

/** `?preview=` wins (`self` clears it), else what this tab remembered. */
export function previewFrom(search: string, remembered: string | null): PreviewTier | null {
  const asked = new URLSearchParams(search).get(PARAM);
  if (asked === 'self') return null;
  if (isPreviewTier(asked)) return asked;
  return isPreviewTier(remembered) ? remembered : null;
}

const PREVIEW_ONLY = 'PREVIEW_ONLY';

/**
 * The command client while previewing: reads the tier may run go through; reads above it get
 * the server's own refusal; actions never run.
 */
export function previewClient(
  inner: CommandClient,
  tier: PreviewTier,
  tiers: Record<string, Tier>,
): CommandClient {
  const have: Tier = tier === 'visitor' ? 'public' : tier;
  const order = ['public', 'member', 'recruit', 'raider', 'leader', 'officer'];
  const allowed = (name: string) => order.indexOf(have) >= order.indexOf(tiers[name] ?? 'officer');
  return {
    read<T>(name: string, input?: unknown): Promise<CommandResult<T>> {
      if (allowed(name)) return inner.read<T>(name, input);
      return Promise.resolve({
        success: false,
        error: {
          code: 'COMMAND_NOT_FOUND',
          message: `No command named "${name}" is available to you`,
          suggestion: 'Use afd-discover to list the commands you can run',
          retryable: false,
        },
      });
    },
    run<T>(name: string): Promise<CommandResult<T>> {
      return Promise.resolve({
        success: false,
        error: {
          code: PREVIEW_ONLY,
          message: `You're previewing the site as ${labelFor(tier)}, so ${name} didn't run and nothing changed`,
          suggestion: 'Switch the preview back to yourself to make changes',
          retryable: false,
        },
      });
    },
  };
}

const LABELS: Record<PreviewTier, string> = {
  visitor: 'a visitor',
  member: 'a member',
  recruit: 'a recruit',
  raider: 'a raider',
  leader: 'a raid leader',
};
const labelFor = (tier: PreviewTier) => LABELS[tier];

/**
 * Each command's tier, from the same module command lists apps/api registers (the manifest is
 * built from them too). Loaded only when previewing.
 */
export async function commandTiers(): Promise<Record<string, Tier>> {
  const lists = await Promise.all([
    import('@vintage/identity/commands').then((m) => m.identityCommands),
    import('@vintage/raids/commands').then((m) => m.raidsCommands),
    import('@vintage/coordinator/commands').then((m) => m.coordinatorCommands),
    import('@vintage/polls/commands').then((m) => m.pollsCommands),
    import('@vintage/progress/commands').then((m) => m.progressCommands),
    import('@vintage/site/commands').then((m) => m.siteCommands),
  ]);
  return Object.fromEntries(lists.flat().map((c) => [c.name, c.tier]));
}

/** Leave the preview and load the page as yourself. */
export function endPreview(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete(PARAM);
  location.assign(url);
}

/**
 * For leaders and officers: read the preview for this page load, cap the session and the command
 * client to it, and add the floating control. Call after sign-in and before the router mounts.
 */
export async function installPreview(): Promise<void> {
  const real = realSession();
  if (!real || !canPreviewAs(real, 'visitor')) return;
  let remembered: string | null = null;
  try {
    remembered = sessionStorage.getItem(STORAGE_KEY);
  } catch {}
  const wanted = previewFrom(location.search, remembered);
  setPreview(wanted && canPreviewAs(real, wanted) ? wanted : null);
  const tier = currentPreview();
  try {
    if (tier) sessionStorage.setItem(STORAGE_KEY, tier);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  if (tier) {
    setCommandClient(previewClient(getCommandClient(), tier, await commandTiers()));
  }
  installControl(real.tier, tier);
}

function installControl(realTier: string, tier: PreviewTier | null): void {
  const label = document.createElement('label');
  label.className = `preview-switch${tier ? ' on' : ''}`;
  label.title = tier
    ? 'Previewing: the site as this tier sees it, on live data. Nothing you do is saved.'
    : 'See the site as a lower tier sees it, on live data';
  label.append(tier ? 'Previewing as' : 'Preview as');
  const select = document.createElement('select');
  select.append(new Option(`yourself · ${realTier}`, 'self', false, tier === null));
  for (const t of Object.keys(PREVIEW_TIERS) as PreviewTier[]) {
    if (canPreviewAs(realSession(), t)) select.append(new Option(t, t, false, t === tier));
  }
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set(PARAM, select.value);
    location.assign(url);
  });
  label.append(select);
  if (tier) {
    const note = document.createElement('small');
    note.className = 'preview-note';
    note.textContent = 'nothing is saved';
    label.append(note);
  }
  document.body.append(label);
}
