// What one turn of the officers' assistant panel shows, from an agent run (#168). Pure: the
// panel element renders this, and the tests check it without a DOM. The run is the agent
// module's `agent-run-get` answer; ui-kit keeps its own slice of it, as the desks do.

/** One recorded function call of a run (the agent module's `AgentToolCall`). */
export interface AgentPanelToolCall {
  name: string;
  command: string | null;
  success: boolean;
  summary: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

/** A change the agent prepared (the agent module's `ConfirmationView`). */
export interface AgentPanelConfirmation {
  id: string;
  summary: string;
  status: 'pending' | 'done' | 'failed' | 'declined' | 'expired';
  result?: unknown;
}

export interface AgentPanelContext {
  page: string;
  selection?: { kind: string; id: string; label: string };
}

/** The slice of `agent-run-get` the panel reads. */
export interface AgentPanelRun {
  id: string;
  prompt: string;
  status: 'queued' | 'running' | 'answered' | 'failed' | 'cancelled';
  answer: string | null;
  error: string | null;
  notes: string[];
  draft: string | null;
  toolCalls: AgentPanelToolCall[];
  confirmations: AgentPanelConfirmation[];
  context: AgentPanelContext | null;
  cancelRequested: boolean;
  createdAt: number;
  finishedAt: number | null;
}

/** One line in a turn's activity: a guild command the agent read or prepared. */
export interface ToolRow {
  key: string;
  label: string;
  /** The command's input in words, ids left out ("status tentative"), or null. */
  detail: string | null;
  failed: boolean;
  error: string | null;
}

export interface ApprovalView {
  id: string;
  summary: string;
  state: AgentPanelConfirmation['status'];
  /** "Done", "Dropped", …, or null while it waits for Confirm. */
  outcome: string | null;
}

export interface TurnView {
  id: string;
  question: string;
  /** What the officer was looking at when they asked ("Tonight · Molten Core"), or null. */
  contextLabel: string | null;
  /** How many times the agent looked up which commands exist (afd-discover, afd-detail). */
  lookups: number;
  rows: ToolRow[];
  /** Two or more command rows fold into "Ran N commands". */
  folded: boolean;
  notes: string[];
  /** The answer, or the answer so far while it is written. */
  text: string | null;
  streaming: boolean;
  /** "Working on it", "Stopping…", "Stopped", or why it failed; null once answered. */
  statusText: string | null;
  tone: 'default' | 'error' | 'muted';
  /** Time the turn took (or has taken), in whole seconds. */
  seconds: number;
  active: boolean;
  approvals: ApprovalView[];
}

const LOOKUP_TOOLS = new Set(['afd-discover', 'afd-detail']);
const READ_VERBS = new Set([
  'list',
  'get',
  'status',
  'log',
  'runs',
  'search',
  'suggest',
  'preview',
]);

const plural = (noun: string) => (noun.endsWith('s') ? noun : `${noun}s`);

/**
 * A command in words. AFD names are `<noun>-<verb>`: reads become "Read signups" or "Checked
 * coordinator status"; anything else the agent can only prepare ("Prepared roster lock").
 */
export function commandLabel(command: string): string {
  const parts = command.split('-');
  const verb = parts.length > 1 ? (parts.pop() as string) : '';
  const noun = parts.join(' ');
  if (verb === 'list') return `Read ${plural(noun)}`;
  if (verb === 'runs' || verb === 'log') return `Read ${noun} ${verb}`;
  if (verb === 'status') return `Checked ${noun} status`;
  if (READ_VERBS.has(verb)) return `Read ${noun}`;
  return `Prepared ${[noun, verb].filter(Boolean).join(' ')}`;
}

/** The summary's input part: `signup-set: status tentative` → `status tentative`. */
function detailOf(call: AgentPanelToolCall): string | null {
  const summary = call.summary ?? '';
  const colon = summary.indexOf(': ');
  return colon >= 0 ? summary.slice(colon + 2) : null;
}

export function toolRows(calls: readonly AgentPanelToolCall[]): {
  lookups: number;
  rows: ToolRow[];
} {
  let lookups = 0;
  const rows: ToolRow[] = [];
  calls.forEach((call, i) => {
    if (LOOKUP_TOOLS.has(call.name)) {
      lookups++;
      return;
    }
    rows.push({
      key: `${i}`,
      label: call.command ? commandLabel(call.command) : 'Tried a command it could not find',
      detail: call.command ? detailOf(call) : null,
      failed: !call.success,
      error: call.success ? null : call.error,
    });
  });
  return { lookups, rows };
}

const OUTCOME: Record<AgentPanelConfirmation['status'], string | null> = {
  pending: null,
  done: 'Done',
  failed: 'Failed',
  declined: 'Dropped',
  expired: 'Expired',
};

/** A prepared change's line with the command in words; its input stays as written. */
export function changeSummary(summary: string): string {
  const colon = summary.indexOf(': ');
  const name = colon >= 0 ? summary.slice(0, colon) : summary;
  if (!/^[a-z]+(-[a-z]+)+$/.test(name)) return summary;
  const words = name.replace(/-/g, ' ');
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  return colon >= 0 ? `${title}: ${summary.slice(colon + 2)}` : title;
}

export function contextLabel(context: AgentPanelContext | null | undefined): string | null {
  if (!context) return null;
  const page = context.page.replace(/^Officers’ quarters · |^Officers' quarters · /, '');
  return context.selection ? `${page} · ${context.selection.label}` : page;
}

function statusOf(run: AgentPanelRun): Pick<TurnView, 'statusText' | 'tone'> {
  if (run.status === 'answered') return { statusText: null, tone: 'default' };
  if (run.status === 'failed') {
    return { statusText: run.error ?? 'Random couldn’t answer that.', tone: 'error' };
  }
  if (run.status === 'cancelled') return { statusText: 'Stopped', tone: 'muted' };
  return { statusText: run.cancelRequested ? 'Stopping…' : 'Working on it', tone: 'muted' };
}

export function turnView(run: AgentPanelRun, now: number): TurnView {
  const { lookups, rows } = toolRows(run.toolCalls);
  const active = run.status === 'queued' || run.status === 'running';
  const text = run.status === 'answered' ? run.answer : active ? run.draft : null;
  return {
    id: run.id,
    question: run.prompt,
    contextLabel: contextLabel(run.context),
    lookups,
    rows,
    folded: rows.length >= 2,
    notes: run.notes,
    text: text || null,
    streaming: active && Boolean(run.draft),
    ...statusOf(run),
    seconds: Math.max(0, Math.round(((run.finishedAt ?? now) - run.createdAt) / 1000)),
    active,
    approvals: run.confirmations.map((c) => ({
      id: c.id,
      summary: changeSummary(c.summary),
      state: c.status,
      outcome: OUTCOME[c.status],
    })),
  };
}

/** Starter prompts for the open tab: what officers ask most there. */
export const STARTER_PROMPTS: Record<string, string[]> = {
  tonight: [
    'Who hasn’t answered for this raid?',
    'Do we have enough healers?',
    'Who signed up late?',
  ],
  calendar: ['What raids are coming up this month?', 'Which raid nights have the fewest signups?'],
  coordinator: ['What has Random posted this week?', 'Is Random paused?'],
  recruiting: ['What are we recruiting for?', 'Which classes are we short of?'],
  applications: ['Summarize the open applications', 'Which applications are waiting longest?'],
  polls: ['Which polls are open?', 'What did the last poll decide?'],
  progress: ['What did we kill last week?', 'What’s our next progression boss?'],
  guild: ['What does the About page say?'],
};
