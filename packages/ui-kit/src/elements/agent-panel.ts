import {
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
import { getCommandClient } from '../client';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';
import {
  type AgentPanelConfirmation,
  type AgentPanelContext,
  type AgentPanelRun,
  type ApprovalView,
  contextLabel,
  type ToolRow,
  type TurnView,
  turnView,
} from './agent-panel-model';
import './markdown-text';

/** How often a running question is read again while the panel waits for it. */
export const POLL_MS = 700;
/** Questions of this thread shown when the panel opens. */
const HISTORY = 20;
const THREAD_KEY = 'vintage:agent-thread';

const newThread = () =>
  `web-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

/** The conversation this browser tab is in: kept per tab, so a reload carries on. */
function storedThread(): string {
  try {
    const found = sessionStorage.getItem(THREAD_KEY);
    if (found) return found;
    const made = newThread();
    sessionStorage.setItem(THREAD_KEY, made);
    return made;
  } catch {
    return newThread();
  }
}

/** A run as `agent-runs` lists it (no confirmations) or `agent-run-get` answers it. */
type RunData = Omit<AgentPanelRun, 'confirmations'> & {
  confirmations?: AgentPanelConfirmation[];
  confirmationIds?: string[];
};

const asRun = (data: RunData): AgentPanelRun => ({
  ...data,
  notes: data.notes ?? [],
  draft: data.draft ?? null,
  toolCalls: data.toolCalls ?? [],
  context: data.context ?? null,
  cancelRequested: data.cancelRequested ?? false,
  confirmations: data.confirmations ?? [],
});

const STATUS: Record<TurnView['tone'], string> = {
  default: 'streaming',
  muted: 'streaming',
  error: 'error',
};

const rowTemplate = html<ToolRow>`
  <li class="row ${(r) => (r.failed ? 'failed' : '')}">
    <span class="label">${(r) => r.label}</span>
    ${when((r) => r.detail, html<ToolRow>`<span class="detail">${(r) => r.detail}</span>`)}
    ${when((r) => r.error, html<ToolRow>`<span class="detail">${(r) => r.error}</span>`)}
  </li>
`;

/** The panel, from inside a turn’s repeat (its parent is the turn). */
const panelOf = (c: ExecutionContext) => c.parentContext.parent as VintageAgentPanel;

const approvalTemplate = html<ApprovalView, TurnView>`
  ${when(
    (a) => a.state === 'pending',
    html<ApprovalView, TurnView>`
      <violet-approval-card state="pending">
        <span slot="summary">${(a) => a.summary}</span>
        <span slot="actions" class="actions">
          <button
            type="button"
            class="primary"
            ?disabled="${(_a, c) => panelOf(c).busy}"
            @click="${(a, c) => panelOf(c).confirm(a.id)}"
          >Confirm</button>
          <button
            type="button"
            ?disabled="${(_a, c) => panelOf(c).busy}"
            @click="${(a, c) => panelOf(c).decline(a.id)}"
          >Drop</button>
        </span>
      </violet-approval-card>
    `,
    html<ApprovalView>`<p class="outcome ${(a) => a.state}">${(a) => a.outcome}: ${(a) => a.summary}</p>`,
  )}
`;

const turnTemplate = html<TurnView, VintageAgentPanel>`
  <violet-message message-role="user">
    <violet-message-text state="done">${(t) => t.question}</violet-message-text>
    ${when((t) => t.contextLabel, html<TurnView>`<span slot="meta" class="chip">${(t) => t.contextLabel}</span>`)}
  </violet-message>
  <violet-message message-role="assistant" tone="${(t) => t.tone}" ?streaming="${(t) => t.streaming}">
    ${repeat((t) => t.notes, html<string>`<p class="note">${(n) => n}</p>`)}
    ${when(
      (t) => t.lookups > 0 || t.rows.length > 0,
      html<TurnView>`
        <div class="activity" part="activity">
          ${when((t) => t.lookups > 0, html<TurnView>`<p class="lookup">Looked up commands</p>`)}
          ${when(
            (t) => t.folded,
            html<TurnView>`
              <details>
                <summary>${(t) => (t.active ? 'Running' : 'Ran')} ${(t) => t.rows.length} commands</summary>
                <ul class="rows">${repeat((t) => t.rows, rowTemplate)}</ul>
              </details>
            `,
            html<TurnView>`<ul class="rows">${repeat((t) => t.rows, rowTemplate)}</ul>`,
          )}
        </div>
      `,
    )}
    ${when((t) => t.text, html<TurnView>`<vintage-markdown :text="${(t) => t.text ?? ''}"></vintage-markdown>`)}
    ${repeat((t) => t.approvals, approvalTemplate)}
    ${when(
      (t) => t.statusText,
      html<TurnView>`
        <violet-message-status status="${(t) => (t.tone === 'error' ? 'error' : t.statusText === 'Stopped' ? 'cancelled' : STATUS[t.tone])}">
          ${(t) => t.statusText}<span class="seconds" aria-hidden="true"> · ${(t) => t.seconds}s</span>
        </violet-message-status>
      `,
      html<TurnView>`<span slot="meta" class="took">Took ${(t) => t.seconds}s</span>`,
    )}
  </violet-message>
`;

const template = html<VintageAgentPanel>`
  <section class="panel" part="panel" aria-label="Ask Random">
    <header class="head" part="head">
      <div class="title">
        <h2>Random</h2>
        ${when((x) => x.usageText, html<VintageAgentPanel>`<span class="usage">${(x) => x.usageText}</span>`)}
      </div>
      <button type="button" class="quiet" @click="${(x) => x.newChat()}" ?disabled="${(x) => x.active}">New chat</button>
      <button type="button" class="quiet" aria-label="Close the panel (Alt+A)" @click="${(x) => x.$emit('agent-close')}">Close</button>
    </header>
    <violet-conversation-thread ?busy="${(x) => x.active}" ?empty="${(x) => !x.runs.length}">
      <div slot="empty" class="empty">
        <p>Ask Random about raids, signups, applications, or anything an officer can do here. Changes wait for you to confirm.</p>
        ${when(
          (x) => x.prompts.length,
          html<VintageAgentPanel>`
            <violet-chat-suggestions @select="${(x, c) => x.ask((c.event as CustomEvent<{ text: string }>).detail.text)}">
              ${repeat((x) => x.prompts, html<string>`<button type="button">${(p) => p}</button>`)}
            </violet-chat-suggestions>
          `,
        )}
      </div>
      ${repeat((x) => x.turns, turnTemplate)}
    </violet-conversation-thread>
    ${when((x) => x.error, html<VintageAgentPanel>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when(
      (x) => x.contextText,
      html<VintageAgentPanel>`
        <p class="context">
          <span>Looking at <strong>${(x) => x.contextText}</strong></span>
          <button type="button" class="quiet" aria-label="Ask without this" @click="${(x) => x.dropContext()}">×</button>
        </p>
      `,
    )}
    <violet-chat-composer
      label="Ask Random"
      placeholder="Ask about raids, signups, applications…"
      status="${(x) => (x.active ? 'streaming' : 'ready')}"
      @submit="${(x, c) => x.ask((c.event as CustomEvent<{ text: string }>).detail.text)}"
      @stop="${(x) => x.stop()}"
    ></violet-chat-composer>
  </section>
`;

const styles = css`
  :host {
    display: block;
    block-size: 100%;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--desk-font-size);
  }
  .panel {
    display: grid;
    grid-template-rows: auto 1fr auto auto auto;
    gap: var(--space-sm);
    block-size: 100%;
    min-block-size: 24rem;
    padding: var(--space-sm);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }
  .head {
    display: flex;
    align-items: start;
    gap: var(--space-xs);
  }
  .title {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }
  .head button {
    white-space: nowrap;
  }
  .head h2 {
    margin: 0;
    font-size: var(--font-size-md);
  }
  .usage,
  .took,
  .seconds,
  .lookup,
  .note,
  .detail {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }
  .note {
    margin: 0;
    font-style: italic;
  }
  .lookup {
    margin: 0;
  }
  .rows {
    margin: 0;
    padding-inline-start: var(--space-md);
    display: grid;
    gap: var(--space-xs);
  }
  .row .detail::before {
    content: ' · ';
  }
  .row.failed .label {
    color: var(--color-text-danger);
  }
  .activity {
    display: grid;
    gap: var(--space-xs);
    margin-block-end: var(--space-xs);
  }
  details summary {
    cursor: pointer;
    color: var(--color-text-secondary);
  }
  .chip,
  .context {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }
  .context {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
  }
  .outcome {
    margin: var(--space-xs) 0 0;
    color: var(--color-text-secondary);
  }
  .outcome.failed {
    color: var(--color-text-danger);
  }
  .empty p {
    color: var(--color-text-secondary);
  }
  .error {
    margin: 0;
    color: var(--color-text-danger);
  }
  button {
    font: inherit;
    min-block-size: var(--desk-control-height);
    padding: 0 var(--space-sm);
    border-radius: var(--radius-sm);
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-base);
    color: var(--color-text-primary);
    cursor: pointer;
  }
  button.primary {
    background: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: var(--color-text-on-accent);
  }
  button.quiet {
    border-color: transparent;
    background: transparent;
    color: var(--color-text-secondary);
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .actions {
    display: flex;
    gap: var(--space-xs);
  }
`;

/**
 * The officers' assistant (#168): Random beside the work. Ask in plain words; watch the commands
 * it reads, its notes, and the answer as it is written; confirm or drop each change it prepares.
 * The conversation is the thread's runs (`agent-runs`), kept for the browser tab; a running
 * question is read again every POLL_MS (`agent-run-get`) until it ends.
 *
 * @tagname vintage-agent-panel
 * @summary Ask Random, see it work, confirm its changes.
 * @fires agent-changed - After a confirmed change ran, so the page re-reads.
 * @fires agent-close - When the officer closes the panel.
 * @csspart panel - The whole panel.
 * @csspart head - The title row.
 * @csspart activity - A turn's command rows.
 */
export class VintageAgentPanel extends FASTElement {
  /** What the officer is looking at, sent with each question unless dropped. */
  @observable context: AgentPanelContext | null = null;
  /** Starter prompts for the open tab, shown before the first question. */
  @observable prompts: string[] = [];
  /** Officers only: show this month's questions against the guild cap (`agent-status`). */
  @observable showUsage = false;
  @observable runs: AgentPanelRun[] = [];
  @observable error = '';
  @observable busy = false;
  @observable usageText = '';
  @observable contextDropped = false;
  @observable now = Date.now();
  @observable thread = storedThread();
  private poller: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  /**
   * Escape stops a running question wherever focus is (sending can leave focus outside the
   * panel), but steps aside for whatever else used the key: an open menu that already handled
   * it, an open dialog, or text composition.
   */
  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.active || event.isComposing || event.defaultPrevented) {
      return;
    }
    if (this.ownerDocument.querySelector('dialog[open]')) return;
    event.preventDefault();
    void this.stop();
  };

  @volatile
  get turns(): TurnView[] {
    return this.runs.map((r) => turnView(r, this.now));
  }

  @volatile
  get active(): boolean {
    return this.runs.some((r) => r.status === 'queued' || r.status === 'running');
  }

  @volatile
  get contextText(): string | null {
    return this.contextDropped ? null : contextLabel(this.context);
  }

  contextChanged(): void {
    this.contextDropped = false;
  }

  showUsageChanged(): void {
    if (this.showUsage && this.$fastController.isConnected) void this.loadUsage();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.onKey);
    void this.loadHistory();
    if (this.showUsage) void this.loadUsage();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('keydown', this.onKey);
    this.stopPolling();
  }

  dropContext(): void {
    this.contextDropped = true;
  }

  /** Start a new conversation in this browser tab. */
  newChat(): void {
    if (this.active) return;
    this.thread = newThread();
    try {
      sessionStorage.setItem(THREAD_KEY, this.thread);
    } catch {
      // Private mode: the thread lasts as long as the page.
    }
    this.runs = [];
    this.error = '';
  }

  /** The thread's recent questions, oldest first, with their prepared changes. */
  async loadHistory(): Promise<void> {
    const client = getCommandClient();
    const listed = await client.read<RunData[]>('agent-runs', {
      thread: this.thread,
      kind: 'ask',
      limit: HISTORY,
    });
    if (!listed.success) {
      this.error = describeError(toElementResult(listed));
      return;
    }
    const runs = (listed.data ?? []).slice().reverse();
    const full = await Promise.all(
      runs.map(async (r) =>
        r.confirmationIds?.length ? ((await this.readRun(r.id)) ?? asRun(r)) : asRun(r),
      ),
    );
    this.runs = full;
    if (this.active) this.startPolling();
  }

  @command('vintage.agent-ask', {
    label: 'Ask Random',
    description: 'Ask the guild agent a question, with the page in view as context.',
    category: 'Officers',
  })
  async ask(question: string): Promise<ElementResult<unknown>> {
    const text = question?.trim() ?? '';
    if (!text) return failure({ code: 'COMMAND_DISABLED', message: 'Write a question first' });
    if (this.active) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Random is still answering' });
    }
    this.error = '';
    const context = this.contextDropped ? null : this.context;
    const result = toElementResult(
      await getCommandClient().run<{ runId: string }>('agent-ask', {
        question: text,
        thread: this.thread,
        ...(context ? { context } : {}),
      }),
    );
    if (!result.success) {
      this.error = describeError(result);
      return result;
    }
    const at = Date.now();
    this.runs = [
      ...this.runs,
      asRun({
        id: result.data.runId,
        prompt: text,
        status: 'queued',
        answer: null,
        error: null,
        notes: [],
        draft: null,
        toolCalls: [],
        context,
        cancelRequested: false,
        createdAt: at,
        finishedAt: null,
      }),
    ];
    this.now = at;
    this.startPolling();
    return result;
  }

  @command('vintage.agent-stop', {
    label: 'Stop Random',
    description: 'Stop the question Random is working on.',
    category: 'Officers',
  })
  async stop(): Promise<ElementResult<unknown>> {
    const run = this.runs.find((r) => r.status === 'queued' || r.status === 'running');
    if (!run) return failure({ code: 'COMMAND_DISABLED', message: 'Nothing to stop' });
    this.replace({ ...run, cancelRequested: true });
    const result = toElementResult(await getCommandClient().run('agent-cancel', { runId: run.id }));
    if (!result.success) this.error = describeError(result);
    void this.refresh(run.id);
    return result;
  }

  @command('vintage.agent-confirm', {
    label: 'Confirm a change',
    description: 'Run a change Random prepared.',
    category: 'Officers',
  })
  confirm(confirmationId: string): Promise<ElementResult<unknown>> {
    return this.settleChange('agent-confirm', confirmationId, true);
  }

  @command('vintage.agent-decline', {
    label: 'Drop a change',
    description: 'Drop a change Random prepared, without running it.',
    category: 'Officers',
  })
  decline(confirmationId: string): Promise<ElementResult<unknown>> {
    return this.settleChange('agent-decline', confirmationId, false);
  }

  private async settleChange(
    name: 'agent-confirm' | 'agent-decline',
    confirmationId: string,
    changes: boolean,
  ): Promise<ElementResult<unknown>> {
    const run = this.runs.find((r) => r.confirmations.some((c) => c.id === confirmationId));
    if (!run || this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Nothing to do' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, { confirmationId }));
      if (!result.success) this.error = describeError(result);
      await this.refresh(run.id);
      if (result.success && changes) this.$emit('agent-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private async readRun(runId: string): Promise<AgentPanelRun | null> {
    const read = await getCommandClient().read<RunData>('agent-run-get', { runId });
    return read.success && read.data ? asRun(read.data) : null;
  }

  private replace(run: AgentPanelRun): void {
    this.runs = this.runs.map((r) => (r.id === run.id ? run : r));
  }

  private async refresh(runId: string): Promise<void> {
    const run = await this.readRun(runId);
    if (run) this.replace(run);
  }

  private startPolling(): void {
    if (!this.poller) {
      this.poller = setInterval(() => void this.poll(), POLL_MS);
    }
    if (!this.clock) {
      this.clock = setInterval(() => {
        this.now = Date.now();
      }, 1000);
    }
  }

  private stopPolling(): void {
    if (this.poller) clearInterval(this.poller);
    if (this.clock) clearInterval(this.clock);
    this.poller = null;
    this.clock = null;
  }

  /** Read the running question again; stop once nothing is running. */
  async poll(): Promise<void> {
    const running = this.runs.filter((r) => r.status === 'queued' || r.status === 'running');
    for (const run of running) await this.refresh(run.id);
    this.now = Date.now();
    if (!this.active) {
      this.stopPolling();
      if (this.showUsage) void this.loadUsage();
    }
  }

  async loadUsage(): Promise<void> {
    const status = await getCommandClient().read<{
      config: { guildMonthlyAsks: number };
      usage: { asksThisMonth: number };
    }>('agent-status', {});
    if (!status.success || !status.data) return;
    const { asksThisMonth } = status.data.usage;
    const cap = status.data.config.guildMonthlyAsks;
    this.usageText = `${asksThisMonth.toLocaleString('en-US')} of ${cap.toLocaleString('en-US')} questions this month`;
  }
}

if (!customElements.get('vintage-agent-panel')) {
  await VintageAgentPanel.define({ name: 'vintage-agent-panel', template, styles });
}
