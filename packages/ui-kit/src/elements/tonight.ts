import {
  attr,
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { ROLES, type Role } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';

/** The raid the Tonight view is about: the slice of `raid-get` / `raid-list` it shows. */
export interface TonightRaid {
  id: string;
  name: string;
  /** Epoch ms. */
  startsAt: number;
  /** Null for an open event (kind `other` with no cap). */
  size: number | null;
  status: string;
  /** Epoch ms when drafted parties were approved, or null while unapproved. */
  rosterApprovedAt?: number | null;
}

/** One signup as the Tonight view shows it: the slice of `signup-list`. */
export interface TonightSignup {
  id: string;
  characterName: string;
  class: string;
  spec: string;
  role: string;
  status: string;
  queued: boolean;
  note: string | null;
  roster: string;
  group: number | null;
}

interface RoleGroup {
  role: Role;
  label: string;
  rows: TonightSignup[];
}

/** A raid an export can be checked against: one from the last week or the next day. */
export interface TonightRecentRaid {
  id: string;
  name: string;
  /** Epoch ms. */
  startsAt: number;
}

/** What `raid-export-check` returns, as far as Tonight shows it (raids' ExportCheck). */
export interface TonightExportCheck {
  event: { id: string; name: string; startsAt: number; status: string } | null;
  otherGuild: boolean;
  exporter: string;
  addonVersion: string;
  snapshots: { at: number; label: string | null; present: number; online: number }[];
  attendees: {
    name: string;
    snapshots: number;
    characterId: string | null;
    matchedWithoutRealm?: boolean;
  }[];
  loot: {
    itemId: number;
    itemName: string | null;
    looter: string;
    count: number;
    source: string | null;
  }[];
  unknownNames: string[];
  absent: { characterId: string; characterName: string; status: string }[];
  declinedButSeen?: string[];
  standby?: { characterId: string; name: string; reason: string }[];
  bosses?: { name: string; attempts: number; kills: number; wipes: number }[];
  warnings?: { code: string; message: string }[];
}

/** A boss kill matched (or not) to the progress ledger in a `raid-export-record` preview. */
export interface TonightExportKill {
  name: string;
  raidId: string | null;
  bossId: string | null;
}

/** What `raid-export-record` did with one boss kill on the progress ledger. */
export interface TonightLedgerKill extends TonightExportKill {
  outcome: 'first' | 'again' | 'duplicate' | 'unmatched' | 'refused';
  detail: string | null;
}

/** The dryRun preview `raid-export-record` returns before confirmation. */
export interface TonightExportRecordPreview {
  event: { id: string; name: string; startsAt: number; status: string };
  unchanged: boolean;
  replaces?: { exporter: string; exportedAt: number; attended: number; drops: number } | null;
  completes?: boolean;
  attendance?: { name: string; snapshots: number; stoodBy?: boolean }[];
  drops?: { itemId: number; itemName: string | null; count: number; looter: string }[];
  kills?: TonightExportKill[];
  check?: TonightExportCheck;
}

/** What `raid-export-record` returns once confirmed (or when unchanged). */
export interface TonightExportRecorded {
  event: { id: string; name: string; startsAt: number; status: string };
  unchanged: boolean;
  record: {
    attended: number;
    drops: number;
    snapshots: number;
    exporter: string;
    bosses?: {
      killed: number;
      total: number | null;
      wipes: number;
      firstPullAt: number;
      lastEndAt: number;
    } | null;
  };
  ledger?: TonightLedgerKill[];
  warnings?: { code: string; message: string }[];
}

/** A destructive command's preview, waiting for the officer to confirm or keep. */
interface PendingRemoval {
  signupId: string;
  name: string;
  token: string;
  summary: string;
}

/** A `raid-export-record` preview, waiting for the officer to confirm or cancel. */
interface PendingExportRecord {
  exportString: string;
  eventId: string;
  token: string;
  preview: TonightExportRecordPreview;
  summary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Summarize a `raid-export-record` dryRun preview in plain officer-facing text. */
function recordPreviewSummary(preview: TonightExportRecordPreview): string {
  const attendance = preview.attendance ?? [];
  const stoodBy = attendance.filter((a) => a.stoodBy).length;
  const drops = preview.drops?.length ?? 0;
  const parts: string[] = [
    `${attendance.length} attended${stoodBy ? ` (${stoodBy} stood by)` : ''}, ${plural(drops, 'drop')}`,
  ];
  if (preview.replaces) parts.push('replaces the export recorded earlier');
  if (preview.completes) parts.push(`completes ${preview.event.name}`);
  const kills = preview.kills ?? [];
  const matched = kills.filter((k) => k.bossId !== null).length;
  const unmatched = kills.filter((k) => k.bossId === null).map((k) => k.name);
  if (matched) parts.push(`${plural(matched, 'kill')} for the progress ledger`);
  if (unmatched.length) {
    parts.push(`${plural(unmatched.length, 'kill')} matched no boss (${unmatched.join(', ')})`);
  }
  return parts.join(' · ');
}

/** Summarize recorded progress-ledger outcomes, or empty string when there were no kills. */
function ledgerOutcomeLine(ledger: TonightLedgerKill[]): string {
  if (!ledger.length) return '';
  const named = (outcome: TonightLedgerKill['outcome']) =>
    ledger.filter((k) => k.outcome === outcome).map((k) => k.name);
  const parts: string[] = [];
  const first = named('first');
  if (first.length) parts.push(`First kills: ${first.join(', ')}`);
  const again = named('again');
  if (again.length) parts.push(`Repeat kills: ${again.join(', ')}`);
  const unmatched = named('unmatched');
  if (unmatched.length) parts.push(`Matched no boss: ${unmatched.join(', ')}`);
  const refused = ledger.filter((k) => k.outcome === 'refused');
  if (refused.length) {
    parts.push(
      `Not recorded: ${refused.map((k) => `${k.name}${k.detail ? ` (${k.detail})` : ''}`).join(', ')}`,
    );
  }
  return parts.join(' · ');
}

const ROLE_HEADINGS: Record<Role, string> = {
  tank: 'Tanks',
  healer: 'Healers',
  melee: 'Melee',
  ranged: 'Ranged',
};

const ANSWER_WORDS: Record<string, string> = {
  accepted: 'going',
  late: 'late',
  tentative: 'tentative',
  bench: 'bench',
  declined: 'declined',
};

/** The confirm line for a removal, from the server's preview of the signup it would delete. */
function removalSummary(s: Partial<TonightSignup> | undefined): string {
  const answer = s?.status ? (ANSWER_WORDS[s.status] ?? s.status) : '';
  const was = answer ? `Their ${answer}${s?.queued ? ', queued' : ''} signup` : 'The signup';
  return `${was} is deleted, not benched; they would have to sign up again. If they held a spot, the next in line moves up.`;
}

/** Signups that count toward tonight: everyone who hasn't declined. */
const playing = (s: TonightSignup) => s.status !== 'declined';

const rosterLabel = (s: TonightSignup, maxGroup: number) =>
  s.roster === 'benched'
    ? 'Standby'
    : s.group !== null
      ? s.group > maxGroup
        ? `group ${s.group} (over size)`
        : `group ${s.group}`
      : s.queued
        ? 'queued'
        : 'unplaced';

/** In a signup row (inside the role repeat), the element itself. */
const host = (c: ExecutionContext) => c.parentContext.parent as VintageTonight;

const template = html<VintageTonight>`
  <section class="tonight" part="tonight" aria-labelledby="tonight-title">
    <header class="top" part="header">
      <div class="title">
        <span class="eyebrow">Tonight · ${(x) => x.startsLabel}</span>
        <h2 id="tonight-title">${(x) => x.raid?.name ?? (x.loading ? 'Loading tonight…' : 'No raid on the calendar')}</h2>
        <span class="counts">${(x) => x.countsLine}</span>
      </div>
      <div class="actions" part="actions">
        <span class="pill ${(x) => (x.locked ? 'locked' : 'open')}">${(x) => (x.locked ? 'locked' : 'signups open')}</span>
        ${when(
          (x) => x.raid?.rosterApprovedAt != null,
          html`<span class="pill open">parties approved</span>`,
        )}
        ${when(
          (x) => x.raid && x.raid.rosterApprovedAt == null,
          html<VintageTonight>`
            <button
              class="btn"
              ?disabled="${(x) => !x.canAct}"
              @click="${(x) => x.approveRoster()}"
            >Approve and post</button>
          `,
        )}
        <button
          class="btn primary"
          ?disabled="${(x) => !x.canAct}"
          @click="${(x) => (x.locked ? x.unlock() : x.lock())}"
        >${(x) => (x.locked ? 'Unlock signups' : 'Lock the roster')}</button>
        <button class="btn" ?disabled="${(x) => !x.canAct}" @click="${(x) => x.copyImport()}">
          Copy addon import
        </button>
        <button
          class="btn"
          aria-expanded="${(x) => String(x.exportOpen)}"
          ?disabled="${(x) => x.busy}"
          @click="${(x) => x.toggleExport()}"
        >${(x) => (x.canRecord ? 'Check or record export' : 'Check an export')}</button>
      </div>
    </header>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
    ${when(
      (x) => Boolean(x.overSizeWarning),
      html<VintageTonight>`<p class="status error" part="over-size" role="alert">${(x) => x.overSizeWarning}</p>`,
    )}

    ${when(
      (x) => x.pending,
      html<VintageTonight>`
        <div class="confirm" part="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <p id="confirm-text">
            Remove <b>${(x) => x.pending?.name}</b> from ${(x) => x.raid?.name}?
            <span>${(x) => x.pending?.summary}</span>
          </p>
          <button class="btn danger" @click="${(x) => x.confirmRemove()}">Remove</button>
          <button class="btn" @click="${(x) => x.cancelRemove()}">Keep</button>
        </div>
      `,
    )}

    ${when(
      (x) => x.importString,
      html<VintageTonight>`
        <label class="import" part="import">
          <span>Addon import · ${(x) => x.importNote}</span>
          <textarea readonly rows="3" @focus="${(_, c) => (c.event.target as HTMLTextAreaElement).select()}">${(x) => x.importString}</textarea>
        </label>
      `,
    )}

    ${when(
      (x) => x.exportOpen,
      html<VintageTonight>`
        <div class="export" part="export">
          <label class="import">
            <span>${(x) =>
              x.canRecord
                ? 'Raid export from the addon (starts with !VIN:). Check reads without saving; Record previews before saving.'
                : 'Raid export from the addon (starts with !VIN:). Nothing is saved.'}</span>
            <textarea
              rows="3"
              spellcheck="false"
              placeholder="!VIN:1!…"
              :value="${(x) => x.exportText}"
              @input="${(x, c) => x.setExportText((c.event.target as HTMLTextAreaElement).value)}"
            ></textarea>
          </label>
          <div class="export-actions">
            <label class="import">
              <span>Raid</span>
              <select
                ?disabled="${(x) => x.busy}"
                @change="${(x, c) => x.pickExportRaid((c.event.target as HTMLSelectElement).value)}"
              >
                ${repeat(
                  (x) => x.exportRaidOptions,
                  html<{ id: string; label: string }, VintageTonight>`
                    <option
                      value="${(o) => o.id}"
                      ?selected="${(o, c) => c.parent.exportRaidId === o.id}"
                    >${(o) => o.label}</option>
                  `,
                )}
              </select>
            </label>
            <button
              class="btn primary"
              ?disabled="${(x) => x.busy || !x.exportText.trim()}"
              @click="${(x) => x.checkExport()}"
            >Check export</button>
            ${when(
              (x) => x.canRecord,
              html<VintageTonight>`
                <button
                  class="btn"
                  ?disabled="${(x) => x.busy || !x.exportText.trim()}"
                  @click="${(x) => x.recordExport()}"
                >Record export</button>
              `,
            )}
          </div>
          ${when(
            (x) => x.pendingRecord,
            html<VintageTonight>`
              <div class="confirm" part="export-confirm" role="alertdialog" aria-labelledby="record-confirm-text">
                <p id="record-confirm-text">
                  Record export for <b>${(x) => x.pendingRecord?.preview.event.name}</b>?
                  <span>${(x) => x.pendingRecord?.summary}</span>
                </p>
                <button class="btn primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.confirmRecord()}">Record</button>
                <button class="btn" ?disabled="${(x) => x.busy}" @click="${(x) => x.cancelRecord()}">Cancel</button>
              </div>
            `,
          )}
          ${when(
            (x) => x.exportRecorded,
            html<VintageTonight>`
              <div class="card export-result" part="export-recorded">
                <span class="eyebrow">Recorded · ${(x) => x.exportRecorded?.event.name}</span>
                <p>${(x) => x.exportRecordedSummary}</p>
                ${when(
                  (x) => x.exportRecordedLedgerLine,
                  html<VintageTonight>`<p class="names"><b>Progress ledger</b> ${(x) => x.exportRecordedLedgerLine}</p>`,
                )}
                ${when(
                  (x) => !x.exportRecorded?.unchanged,
                  html<VintageTonight>`<p class="names">Vintage posts the raid summary in Discord on the next tick.</p>`,
                )}
              </div>
            `,
          )}
          ${when(
            (x) => x.exportCheck,
            html<VintageTonight>`
              <div class="card export-result" part="export-result">
                <span class="eyebrow">${(x) => x.exportHeading}</span>
                <p>${(x) => x.exportSummary}</p>
                ${repeat(
                  (x) => x.exportCheck?.warnings ?? [],
                  html<{ message: string }>`<p class="warn" role="note">${(w) => w.message}</p>`,
                )}
                ${when(
                  (x) => x.exportBossesLine,
                  html<VintageTonight>`<p class="names"><b>Bosses</b> ${(x) => x.exportBossesLine}</p>`,
                )}
                <p class="names"><b>Snapshots</b> ${(x) => x.exportSnapshotsLine}</p>
                ${when(
                  (x) => (x.exportCheck?.attendees.length ?? 0) > 0,
                  html<VintageTonight>`<p class="names"><b>Seen</b> ${(x) => x.exportSeenLine}</p>`,
                )}
                ${when(
                  (x) => x.exportStandbyLine,
                  html<VintageTonight>`<p class="names"><b>Stood by</b> ${(x) => x.exportStandbyLine}</p>`,
                )}
                ${when(
                  (x) => x.exportCheck?.event && x.exportCheck.unknownNames.length,
                  html<VintageTonight>`<p class="names"><b>Not signed up</b> ${(x) => x.exportCheck?.unknownNames.join(', ')}</p>`,
                )}
                ${when(
                  (x) => x.exportCheck?.absent.length,
                  html<VintageTonight>`<p class="names"><b>Signed up but not seen</b> ${(x) => x.exportCheck?.absent.map((a) => a.characterName).join(', ')}</p>`,
                )}
                ${when(
                  (x) => x.exportCheck?.declinedButSeen?.length,
                  html<VintageTonight>`<p class="names"><b>Declined but came</b> ${(x) => x.exportCheck?.declinedButSeen?.join(', ')}</p>`,
                )}
                ${when(
                  (x) => x.exportLooseNames,
                  html<VintageTonight>`<p class="names"><b>Matched by name only</b> ${(x) => x.exportLooseNames}</p>`,
                )}
                ${when(
                  (x) => x.exportCheck?.loot.length,
                  html<VintageTonight>`<p class="names"><b>Loot</b> ${(x) => x.exportLootLine}</p>`,
                )}
              </div>
            `,
          )}
        </div>
      `,
    )}

    <div class="glance">
      <div class="card" part="gaps">
        <span class="eyebrow">Comp</span>
        ${when((x) => x.loading, html`<p class="muted">Checking…</p>`)}
        ${when((x) => !x.loading && x.gaps.length === 0, html`<p class="ok">No gaps.</p>`)}
        <ul>
          ${repeat((x) => x.gaps, html<string>`<li>${(g) => g}</li>`)}
        </ul>
      </div>
      <div class="card" part="waiting">
        <span class="eyebrow">Waiting on ${(x) => (x.loading ? '…' : x.waiting.length)}</span>
        ${when((x) => x.loading, html`<p class="muted">Checking…</p>`)}
        ${when(
          (x) => !x.loading && x.waiting.length === 0,
          html`<p class="ok">Everyone expected has answered.</p>`,
        )}
        <p class="names">${(x) => x.waiting.join(', ')}</p>
      </div>
    </div>

    <div class="roles" part="roster">
      ${repeat(
        (x) => x.roleGroups,
        html<RoleGroup, VintageTonight>`
          <div class="role">
            <h3>${(g) => g.label} <span>${(g) => g.rows.length}</span></h3>
            <ul>
              ${repeat(
                (g: RoleGroup) => g.rows,
                html<TonightSignup, RoleGroup>`
                  <li class="row ${(s) => s.status} ${(s) => (s.roster === 'benched' ? 'benched' : '')}">
                    <span class="who">
                      <b style="color: var(--color-class-${(s) => s.class})">${(s) => s.characterName}</b>
                      <small>${(s) => titleCase(s.spec)}</small>
                    </span>
                    <span class="answer">${(s) => ANSWER_WORDS[s.status] ?? s.status}${(s) => (s.queued ? ' · queued' : '')}</span>
                    <span class="place">${(s, c) => rosterLabel(s, host(c).maxGroup)}</span>
                    <span class="note">${(s) => s.note ?? ''}</span>
                    <span class="controls">
                      <select
                        aria-label="Group for ${(s) => s.characterName}"
                        ?disabled="${(_, c) => !host(c).canAct}"
                        @change="${(s, c) => host(c).move(s.id, Number((c.event.target as HTMLSelectElement).value))}"
                      >
                        <option value="" ?selected="${(s) => s.group === null}" disabled>group</option>
                        ${repeat(
                          (_, c) => host(c).groupNumbers,
                          html<
                            number,
                            TonightSignup
                          >`<option value="${(n) => n}" ?selected="${(n, c) => c.parent.group === n}">${(n) => n}</option>`,
                        )}
                      </select>
                      <button
                        class="btn small"
                        ?disabled="${(s, c) => !host(c).canAct || s.roster === 'benched'}"
                        @click="${(s, c) => host(c).bench(s.id)}"
                      >Bench</button>
                      <button
                        class="btn small danger"
                        ?disabled="${(_, c) => !host(c).canAct}"
                        @click="${(s, c) => host(c).removeSignup(s.id)}"
                      >Remove</button>
                    </span>
                  </li>
                `,
              )}
            </ul>
          </div>
        `,
      )}
    </div>
    ${when(
      (x) => x.declined.length > 0,
      html<VintageTonight>`<p class="declined" part="declined">Declined: ${(x) => x.declined.map((s) => s.characterName).join(', ')}</p>`,
    )}
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .tonight {
    display: grid;
    gap: var(--space-md);
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: end;
    gap: var(--space-sm) var(--space-lg);
  }

  .title {
    display: grid;
    gap: 0.2rem;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  h2 {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: clamp(1.8rem, 3.4vw, 2.6rem);
    line-height: 1.05;
    letter-spacing: var(--font-tracking-tight);
  }

  .counts {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  .pill {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: var(--border-width-thin) solid var(--color-border-strong);
  }

  .pill.locked {
    color: var(--color-text-accent);
    border-color: color-mix(in srgb, var(--color-text-accent) 60%, transparent);
  }

  .pill.open {
    color: var(--color-accent-secondary);
    border-color: color-mix(in srgb, var(--color-accent-secondary) 60%, transparent);
  }

  .btn {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.5rem 0.9rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    background: var(--color-accent-secondary);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  .btn.danger {
    color: var(--color-text-accent);
  }

  .btn.small {
    padding: 0.25rem 0.55rem;
    font-size: var(--font-size-xs);
  }

  .btn:disabled,
  select:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .status {
    margin: 0;
    min-block-size: 1.2em;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status.error {
    color: var(--color-text-accent);
  }

  .status.success {
    color: var(--color-accent-secondary);
  }

  .status:empty {
    display: none;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-text-accent) 55%, transparent);
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--color-text-accent) 8%, var(--color-surface-raised));
  }

  .confirm p {
    flex: 1 1 18rem;
    margin: 0;
  }

  .confirm p span {
    display: block;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .import {
    display: grid;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  textarea {
    inline-size: 100%;
    box-sizing: border-box;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
    background: var(--color-surface-sunken);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    padding: var(--space-xs);
    resize: vertical;
    word-break: break-all;
  }

  .export {
    display: grid;
    gap: var(--space-sm);
  }

  .export-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm);
  }

  .export-result p {
    margin: 0;
  }

  .export-result b {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-bold);
    margin-inline-end: var(--space-xs);
  }

  .warn {
    color: var(--color-text-accent);
    font-size: var(--font-size-sm);
  }

  .glance {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
  }

  .card ul {
    margin: 0;
    padding-inline-start: 1.1rem;
  }

  .card ul:empty {
    display: none;
  }

  .card p {
    margin: 0;
  }

  .card .ok {
    color: var(--color-accent-secondary);
  }

  .names:empty {
    display: none;
  }

  .roles {
    display: grid;
    gap: var(--space-md);
  }

  h3 {
    margin: 0 0 var(--space-xs);
    font-family: var(--font-family-display);
    font-size: var(--font-size-md);
  }

  h3 span {
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
  }

  .role ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(10rem, 1.3fr) 7rem 6rem minmax(0, 1.4fr) auto;
    align-items: center;
    gap: var(--space-sm);
    padding-block: 0.4rem;
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .row.benched .who b,
  .row.tentative .answer {
    opacity: 0.65;
  }

  .row.late .answer,
  .row.tentative .answer {
    color: var(--color-signup-late);
  }

  .who {
    display: grid;
    min-inline-size: 0;
  }

  .who small,
  .place,
  .note {
    color: var(--color-text-secondary);
  }

  .note {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .controls {
    display: flex;
    gap: var(--space-xs);
    justify-content: end;
  }

  select {
    font: var(--font-size-xs) var(--font-family-sans);
    padding: 0.2rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
  }

  .declined {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  @media (max-width: 62rem) {
    .glance {
      grid-template-columns: 1fr;
    }

    .row {
      grid-template-columns: 1fr auto;
    }

    .answer,
    .place {
      grid-column: 2;
      text-align: end;
    }

    .note {
      grid-column: 1 / -1;
      white-space: normal;
    }

    .note:empty {
      display: none;
    }

    .controls {
      grid-column: 1 / -1;
      justify-content: start;
    }
  }
`;

/**
 * Tonight, in the officers' quarters: the next raid's signups by role, the comp gaps, who
 * hasn't answered, and the raid-night actions as commands. Lock and unlock the roster, place a
 * signup in a group, bench them, remove them (preview and confirm), and copy the addon import
 * string, or check a raid export from the addon (raid-export-check, read-only). Feed it
 * `raid-list` / `raid-get`, `signup-list`, `comp-suggest` gaps, `coordinator-status` waiting,
 * and `recentRaids` (the last week's raids, for the export check); it emits `tonight-changed`
 * after every change so the page re-reads.
 *
 * @tagname vintage-tonight
 * @summary The raid-night view for leaders: roster, gaps, non-responders, and actions.
 * @fires tonight-changed - After a lock, unlock, move, bench, removal, or export record succeeds.
 * @csspart tonight - The whole view.
 * @csspart header - Raid, counts, and the raid-wide actions.
 * @csspart actions - Lock or unlock, and copy the import.
 * @csspart status - The line that says what happened.
 * @csspart confirm - A removal waiting for confirmation.
 * @csspart import - The import string, when copied.
 * @csspart export - The export panel: paste box and its check/record actions.
 * @csspart export-confirm - A `raid-export-record` preview waiting for officer confirmation.
 * @csspart export-recorded - Summary of a recorded export.
 * @csspart export-result - What the check found.
 * @csspart gaps - The comp gaps.
 * @csspart waiting - Who hasn't answered.
 * @csspart roster - The signups by role.
 * @csspart declined - Who declined.
 */
export class VintageTonight extends FASTElement {
  /** The raid, or null when nothing is on the calendar. */
  @observable raid: TonightRaid | null = null;
  @observable signups: TonightSignup[] = [];
  /** Comp gaps as reasons, from `comp-suggest`. */
  @observable gaps: string[] = [];
  /** Who among the expected ranks hasn't answered, from `coordinator-status`. */
  @observable waiting: string[] = [];
  /** IANA zone to show the start in; empty uses the viewer's. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Still reading: the title and the cards say so instead of "no raid" or "no gaps". */
  @attr({ mode: 'boolean' }) loading = false;
  /** Officers can record an export (`raid-export-record`); raid leaders only check it. */
  @attr({ attribute: 'can-record', mode: 'boolean' }) canRecord = false;

  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  @observable pending: PendingRemoval | null = null;
  @observable importString = '';
  @observable importNote = '';
  /** The export panel is open. */
  @observable exportOpen = false;
  @observable exportText = '';
  /** The last `raid-export-check` result (or the check from a record preview), or null. */
  @observable exportCheck: TonightExportCheck | null = null;
  /** The check's own one-line summary (its reasoning). */
  @observable exportSummary = '';
  /** A `raid-export-record` preview waiting for confirmation, or null. */
  @observable pendingRecord: PendingExportRecord | null = null;
  /** The last recorded export result, or null. */
  @observable exportRecorded: TonightExportRecorded | null = null;
  /** The record command's reasoning line. */
  @observable exportRecordedSummary = '';
  /**
   * Raids an export can be checked against (the page reads the last week and the next day).
   * Tonight's `raid` is the next one, which is the wrong raid once it's over.
   */
  @observable recentRaids: TonightRecentRaid[] = [];
  /** The raid to check against; '' leaves it to the raid the export names. */
  @observable exportRaidId = '';
  /** The leader picked a raid themselves, so new data doesn't move the choice. */
  private exportRaidPicked = false;

  recentRaidsChanged(): void {
    const ids = this.exportRaidOptions.map((o) => o.id);
    if (this.exportRaidPicked && ids.includes(this.exportRaidId)) return;
    this.exportRaidPicked = false;
    this.exportRaidId = ids[0] ?? '';
  }

  /**
   * The raid picker's choices: raids that have started, latest first (the one just finished
   * leads), then upcoming ones, soonest first; then the raid the export names.
   */
  @volatile
  get exportRaidOptions(): { id: string; label: string }[] {
    const now = Date.now();
    const started = this.recentRaids
      .filter((r) => r.startsAt <= now)
      .sort((a, b) => b.startsAt - a.startsAt);
    const upcoming = this.recentRaids
      .filter((r) => r.startsAt > now)
      .sort((a, b) => a.startsAt - b.startsAt);
    return [
      ...[...started, ...upcoming].map((r) => ({
        id: r.id,
        label: `${r.name} · ${this.shortDate(r.startsAt)}`,
      })),
      { id: '', label: 'The raid the export names' },
    ];
  }

  /** Attendees matched to a signup without their realm, comma-separated. */
  @volatile
  get exportLooseNames(): string {
    return (this.exportCheck?.attendees ?? [])
      .filter((a) => a.matchedWithoutRealm)
      .map((a) => a.name)
      .join(', ');
  }

  @volatile
  get exportHeading(): string {
    const event = this.exportCheck?.event;
    return event ? `Export · ${event.name}` : 'Export · no raid matched';
  }

  @volatile
  get exportSnapshotsLine(): string {
    const snapshots = this.exportCheck?.snapshots ?? [];
    if (!snapshots.length) return 'none';
    return snapshots
      .map((s) => {
        const offline = s.present - s.online;
        return `${s.label ?? 'snapshot'} ${s.present}${offline > 0 ? ` (${offline} offline)` : ''}`;
      })
      .join(' · ');
  }

  @volatile
  get exportSeenLine(): string {
    const total = this.exportCheck?.snapshots.length ?? 0;
    return (this.exportCheck?.attendees ?? [])
      .map((a) => `${a.name} (${a.snapshots}/${total})`)
      .join(', ');
  }

  @volatile
  get exportLootLine(): string {
    return (this.exportCheck?.loot ?? [])
      .map(
        (l) =>
          `${l.itemName ?? `item ${l.itemId}`}${l.count > 1 ? ` ×${l.count}` : ''} → ${l.looter}` +
          (l.source ? ` (${l.source})` : ''),
      )
      .join(' · ');
  }

  @volatile
  get exportStandbyLine(): string {
    return (this.exportCheck?.standby ?? []).map((s) => s.name).join(', ');
  }

  @volatile
  get exportBossesLine(): string {
    return (this.exportCheck?.bosses ?? [])
      .map((b) => {
        const result =
          b.kills > 0 ? (b.wipes > 0 ? `killed (${b.wipes}w)` : 'killed') : `${b.wipes}w`;
        return `${b.name} ${result}`;
      })
      .join(' · ');
  }

  @volatile
  get exportRecordedLedgerLine(): string {
    return ledgerOutcomeLine(this.exportRecorded?.ledger ?? []);
  }

  get locked(): boolean {
    return this.raid?.status === 'locked';
  }

  @volatile
  get canAct(): boolean {
    return !this.busy && Boolean(this.raid);
  }

  @volatile
  get startsLabel(): string {
    if (!this.raid) return this.loading ? 'loading' : 'nothing posted';
    return this.formatTime(this.raid.startsAt, { timeZoneName: 'short' });
  }

  /** "Wed, Oct 28, 8:00 PM" in the viewer's zone, for the export's raid picker. */
  private shortDate(at: number): string {
    return this.formatTime(at, {});
  }

  private formatTime(at: number, extra: Intl.DateTimeFormatOptions): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...extra,
    };
    try {
      return new Date(at).toLocaleString(undefined, {
        ...options,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
      });
    } catch {
      return new Date(at).toLocaleString(undefined, options);
    }
  }

  @volatile
  get countsLine(): string {
    if (!this.raid) return '';
    const count = (pred: (s: TonightSignup) => boolean) => this.signups.filter(pred).length;
    const going = count((s) => (s.status === 'accepted' || s.status === 'late') && !s.queued);
    const parts = [
      this.raid.size === null ? `${going} going` : `${going} / ${this.raid.size} going`,
    ];
    const late = count((s) => s.status === 'late');
    const tentative = count((s) => s.status === 'tentative');
    const queued = count((s) => s.queued);
    if (late) parts.push(`${late} late`);
    if (tentative) parts.push(`${tentative} tentative`);
    if (queued) parts.push(`${queued} queued`);
    return parts.join(' · ');
  }

  get roleGroups(): RoleGroup[] {
    return ROLES.map((role) => ({
      role,
      label: ROLE_HEADINGS[role],
      rows: this.signups.filter((s) => s.role === role && playing(s)),
    })).filter((g) => g.rows.length > 0);
  }

  get declined(): TonightSignup[] {
    return this.signups.filter((s) => !playing(s));
  }

  /** Highest valid group number for this raid's size (1–8). */
  get maxGroup(): number {
    const size = this.raid ? (this.raid.size ?? 40) : 5;
    return Math.max(1, Math.ceil(size / 5));
  }

  /** 1–2 for tens, 1–4 for twenties, 1–8 for forties: five to a group. */
  get groupNumbers(): number[] {
    return Array.from({ length: this.maxGroup }, (_, i) => i + 1);
  }

  /** Warning shown when a shrunk approved raid has more seated players or out-of-range groups. */
  @volatile
  get overSizeWarning(): string {
    if (!this.raid || this.raid.size === null) return '';
    const rostered = this.signups.filter((s) => s.roster === 'rostered' && playing(s));
    const parts: string[] = [];
    if (rostered.length > this.raid.size) {
      const over = rostered.length - this.raid.size;
      parts.push(
        `Over size: ${rostered.length} seated for ${this.raid.size} seats — move ${over} to Standby.`,
      );
    }
    const outOfRange = rostered.filter((s) => s.group !== null && s.group > this.maxGroup);
    if (outOfRange.length > 0) {
      const names = outOfRange.map((s) => `${s.characterName} (group ${s.group})`).join(', ');
      parts.push(`Out of range: ${names} — move to groups 1–${this.maxGroup} or bench.`);
    }
    return parts.join(' ');
  }

  @command('vintage.roster-approve', {
    label: 'Approve and post',
    description: 'Approve drafted party groups and post them to the signup channel.',
    category: 'Officers',
  })
  async approveRoster(): Promise<ElementResult<unknown>> {
    return this.change(
      'roster-approve',
      { eventId: this.raid?.id },
      'Parties approved; posting to the signup channel',
    );
  }

  @command('vintage.roster-lock', {
    label: 'Lock the roster',
    description: 'Lock signups for tonight; after this only raid leaders can change them.',
    category: 'Officers',
  })
  async lock(): Promise<ElementResult<unknown>> {
    return this.change('roster-lock', { eventId: this.raid?.id }, 'Roster locked');
  }

  @command('vintage.roster-unlock', {
    label: 'Unlock signups',
    description: 'Reopen signups for tonight.',
    category: 'Officers',
  })
  async unlock(): Promise<ElementResult<unknown>> {
    return this.change('roster-unlock', { eventId: this.raid?.id }, 'Signups reopened');
  }

  @command('vintage.roster-move', {
    label: 'Place in a group',
    description: 'Put a signed-up character in a raid group.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' }, group: { type: 'number' } },
      required: ['signupId', 'group'],
    },
  })
  async move(signupId: unknown, group: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string' || !Number.isInteger(group)) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup and a group number' });
    }
    return this.change('roster-move', { signupId, group }, `Moved to group ${group}`);
  }

  @command('vintage.roster-bench', {
    label: 'Bench',
    description: 'Bench a signed-up character for tonight; they keep their signup.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' } },
      required: ['signupId'],
    },
  })
  async bench(signupId: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup to bench' });
    }
    return this.change('roster-bench', { signupId }, 'Benched');
  }

  /**
   * Remove a signup. `roster-remove` is destructive, so the first call is the server's preview;
   * nothing changes until `confirmRemove` sends its confirm token back.
   */
  @command('vintage.roster-remove', {
    label: 'Remove from the raid',
    description: 'Preview removing a signup from tonight; confirm to remove it.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' } },
      required: ['signupId'],
    },
  })
  async removeSignup(signupId: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup to remove' });
    }
    if (!this.canAct) return failure({ code: 'COMMAND_DISABLED', message: 'Busy, or no raid' });
    const name = this.signups.find((s) => s.id === signupId)?.characterName ?? 'this signup';
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: { willRemove?: Partial<TonightSignup> };
        confirmToken?: string;
      }>('roster-remove', { signupId });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (!token) {
        // A server that removed it without asking: nothing left to confirm.
        this.say('success', `Removed ${name}`);
        this.$emit('tonight-changed');
        return result;
      }
      const willRemove = raw.success ? raw.data?.preview?.willRemove : undefined;
      this.pending = { signupId, name, token, summary: removalSummary(willRemove) };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
    }
  }

  async confirmRemove(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'No removal waiting' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'roster-remove',
          { signupId: pending.signupId },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', `Removed ${pending.name}`);
      this.$emit('tonight-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelRemove(): void {
    if (this.pending) this.say('idle', `Kept ${this.pending.name}`);
    this.pending = null;
  }

  @command('vintage.addon-import-get', {
    label: 'Copy the addon import',
    description: 'Get tonight’s addon import string and copy it for pasting in game.',
    category: 'Officers',
  })
  async copyImport(): Promise<ElementResult<unknown>> {
    if (!this.raid) return failure({ code: 'COMMAND_DISABLED', message: 'No raid' });
    this.busy = true;
    try {
      const raw = await getCommandClient().read<{ importString: string; characters: number }>(
        'addon-import-get',
        { eventId: this.raid.id },
      );
      const result = toElementResult(raw);
      if (!result.success || !raw.success || !raw.data) {
        this.say('error', describeError(result));
        return result;
      }
      this.importString = raw.data.importString;
      let copied = false;
      try {
        await navigator.clipboard.writeText(raw.data.importString);
        copied = true;
      } catch {}
      this.importNote = `${raw.data.characters} characters${copied ? ', copied' : ', select and copy'}`;
      this.say(
        'success',
        copied ? 'Import copied. Paste it into the Vintage addon.' : 'Import ready below.',
      );
      return result;
    } finally {
      this.busy = false;
    }
  }

  toggleExport(): void {
    this.exportOpen = !this.exportOpen;
  }

  setExportText(value: string): void {
    this.exportText = value;
    this.pendingRecord = null;
  }

  pickExportRaid(eventId: string): void {
    this.exportRaidPicked = true;
    this.exportRaidId = eventId;
    this.pendingRecord = null;
  }

  /**
   * Checks the pasted export against `eventId`, or the raid picked in the panel (the one that
   * started last, until the leader picks another). An empty `eventId` leaves it to the raid the
   * export names, which is set when the addon imported the raid first.
   */
  @command('vintage.raid-export-check', {
    label: 'Check a raid export',
    description:
      'Read a raid export string from the Vintage addon and match it to a raid: attendance, loot, ' +
      'who was not signed up, and who did not show. Records nothing. Without eventId it uses the ' +
      'raid picked in the panel; an empty eventId uses the raid the export names.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
    },
  })
  async checkExport(eventId?: unknown): Promise<ElementResult<unknown>> {
    if (eventId !== undefined && typeof eventId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'eventId must be a raid id' });
    }
    const exportString = this.exportText.trim();
    if (!exportString)
      return failure({ code: 'COMMAND_DISABLED', message: 'Paste an export first' });
    const target = eventId ?? this.exportRaidId;
    this.busy = true;
    this.pendingRecord = null;
    this.exportRecorded = null;
    try {
      const raw = await getCommandClient().read<TonightExportCheck>('raid-export-check', {
        exportString,
        ...(target ? { eventId: target } : {}),
      });
      const result = toElementResult(raw);
      if (!result.success || !raw.success || !raw.data) {
        this.exportCheck = null;
        this.say('error', describeError(result));
        return result;
      }
      this.exportCheck = raw.data;
      this.exportSummary = String(result.metadata?.reasoning ?? '');
      this.say('success', 'Export checked. Nothing was saved.');
      return result;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Preview recording the pasted export (`raid-export-record` is destructive, officer tier).
   * Nothing is saved until `confirmRecord()` sends the returned confirm token back.
   */
  @command('vintage.raid-export-record', {
    label: 'Record a raid export',
    description:
      'Preview recording a raid export from the Vintage addon: attendance, loot, boss kills for ' +
      'the progress ledger, and completing the raid. Confirm to save.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
    },
  })
  async recordExport(eventId?: unknown): Promise<ElementResult<unknown>> {
    if (eventId !== undefined && typeof eventId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'eventId must be a raid id' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const exportString = this.exportText.trim();
    if (!exportString)
      return failure({ code: 'COMMAND_DISABLED', message: 'Paste an export first' });
    const target = eventId ?? this.exportRaidId;
    this.busy = true;
    this.exportRecorded = null;
    try {
      const raw = await getCommandClient().run<
        {
          preview?: TonightExportRecordPreview;
          confirmToken?: string;
        } & Partial<TonightExportRecorded>
      >('raid-export-record', {
        exportString,
        ...(target ? { eventId: target } : {}),
      });
      const result = toElementResult(raw);
      if (!result.success || !raw.success || !raw.data) {
        this.pendingRecord = null;
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.data.confirmToken;
      const preview = raw.data.preview;
      if (preview?.unchanged) {
        this.pendingRecord = null;
        this.exportRecorded = preview as unknown as TonightExportRecorded;
        this.exportRecordedSummary = `${preview.event.name} already has this export recorded; nothing changed`;
        this.say('success', this.exportRecordedSummary);
        return result;
      }
      if (!token) {
        // Server recorded directly without a confirm step.
        this.pendingRecord = null;
        this.exportRecorded = raw.data as TonightExportRecorded;
        this.exportRecordedSummary = String(result.metadata?.reasoning ?? 'Export recorded');
        this.say('success', this.exportRecordedSummary);
        this.$emit('tonight-changed');
        return result;
      }
      if (!preview) {
        this.pendingRecord = null;
        this.say('error', 'Server returned no preview for recording this export.');
        return result;
      }
      if (preview.check) {
        this.exportCheck = preview.check;
        this.exportSummary = recordPreviewSummary(preview);
      }
      this.pendingRecord = {
        exportString,
        eventId: target,
        token,
        preview,
        summary: recordPreviewSummary(preview),
      };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
    }
  }

  async confirmRecord(): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const pending = this.pendingRecord;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'No export waiting' });
    this.busy = true;
    try {
      const raw = await getCommandClient().run<TonightExportRecorded>(
        'raid-export-record',
        {
          exportString: pending.exportString,
          ...(pending.eventId ? { eventId: pending.eventId } : {}),
        },
        { confirmToken: pending.token },
      );
      const result = toElementResult(raw);
      this.pendingRecord = null;
      if (!result.success || !raw.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.exportRecorded = raw.data ?? null;
      this.exportRecordedSummary = String(
        result.metadata?.reasoning ?? `Recorded ${pending.preview.event.name}`,
      );
      this.say('success', this.exportRecordedSummary);
      this.$emit('tonight-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelRecord(): void {
    if (this.pendingRecord) this.say('idle', 'Export not recorded.');
    this.pendingRecord = null;
  }

  private async change(
    name: string,
    input: Record<string, unknown>,
    done: string,
  ): Promise<ElementResult<unknown>> {
    if (!this.canAct) return failure({ code: 'COMMAND_DISABLED', message: 'Busy, or no raid' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', String(result.metadata?.reasoning ?? done));
      this.$emit('tonight-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private say(kind: 'idle' | 'error' | 'success', text: string): void {
    this.statusKind = kind;
    this.statusText = text;
  }
}

if (!customElements.get('vintage-tonight')) {
  await VintageTonight.define({ name: 'vintage-tonight', template, styles });
}
