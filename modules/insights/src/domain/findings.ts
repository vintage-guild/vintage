// Per-raider findings from one Farsight run summary (#137). Deterministic: every finding is a
// claim about the log with its evidence (counts, times, who hit them), so a raider can check it.
// The model never invents a finding; it may only word one (the DM), and a Decisions question
// gates whether it is worth sending. Helpful, never a ranking: findings are about one raider's
// own play, and no message compares raiders by name.
import type { RunSummaryV1 } from '../farsight/run-summary';

export const FINDING_KINDS = ['deaths', 'killed-by', 'kicks', 'damage-taken'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding {
  character: string;
  kind: FindingKind;
  /** One line a raider reads. */
  text: string;
  /** What backs it: counts and times from the log. */
  evidence: string;
  /** 0 (worth a mention) to 3 (worth fixing first): code's own ordering, before Decisions. */
  weight: number;
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Upload text (names, spells, zones) is written by whoever imported the run and reaches other
 * members and the bot's DMs, so it keeps only what WoW names use: letters, digits, spaces, and
 * ' ’ : , . ( ) -. No markdown, links, or mentions survive, and it is capped.
 */
export const clean = (text: string, max = 64) =>
  text
    .replace(/[^\p{L}\p{N} '’:,.()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || '?';

/** Short names: Farsight strips the realm; Vintage matches characters by name. */
export const shortName = (name: string) => clean(name.split('-')[0] ?? name, 32);

type Member = RunSummaryV1['roster'][number];

function deathFindings(run: RunSummaryV1, name: string): Finding[] {
  const deaths = run.deaths.filter((d) => shortName(d.player) === name && !d.environment);
  if (!deaths.length) return [];
  const out: Finding[] = [
    {
      character: name,
      kind: 'deaths',
      text: `You died ${deaths.length} time${deaths.length === 1 ? '' : 's'} this run.`,
      evidence: `at ${deaths.map((d) => mmss(d.t)).join(', ')}`,
      weight: Math.min(3, deaths.length),
    },
  ];
  const killers = new Map<string, number>();
  for (const d of deaths) {
    if (!d.killing_blow) continue;
    const key = `${clean(d.killing_blow.spell)} (${clean(d.killing_blow.source)})`;
    killers.set(key, (killers.get(key) ?? 0) + 1);
  }
  const [top] = [...killers.entries()].sort((a, b) => b[1] - a[1]);
  if (top && top[1] >= 2) {
    out.push({
      character: name,
      kind: 'killed-by',
      text: `${top[0]} killed you ${top[1]} times. Worth a defensive or stepping out when it comes.`,
      evidence: `${top[1]} of ${deaths.length} deaths`,
      weight: 3,
    });
  }
  return out;
}

function kickFinding(run: RunSummaryV1, name: string): Finding[] {
  const kicks = run.kicks.find((k) => shortName(k.player) === name);
  if (!kicks || kicks.attempts < 3 || kicks.landed / kicks.attempts >= 0.6) return [];
  return [
    {
      character: name,
      kind: 'kicks',
      text: `${kicks.landed} of your ${kicks.attempts} interrupts landed. Early kicks hit nothing; wait for the cast bar.`,
      evidence: `${kicks.landed}/${kicks.attempts} landed`,
      weight: 1,
    },
  ];
}

/** Damage taken: only for non-tanks, and only when it stands well above an even share. */
function damageFinding(member: Member, roster: Member[], tank: string | null): Finding[] {
  const groupTaken = roster.reduce((sum, r) => sum + r.taken, 0);
  if (member.name === tank || groupTaken <= 0 || roster.length < 3) return [];
  const share = member.taken / groupTaken;
  if (share <= 2 / roster.length || share <= 0.2) return [];
  return [
    {
      character: member.name,
      kind: 'damage-taken',
      text: `You took ${Math.round(share * 100)}% of the group's damage without tanking. Check what hit you and whether you can avoid it.`,
      evidence: `${Math.round(member.taken).toLocaleString('en-US')} damage taken`,
      weight: 2,
    },
  ];
}

export function findingsFor(run: RunSummaryV1): Finding[] {
  // One entry per short name: two realms' "Bob" are one character to Vintage.
  const byName = new Map<string, Member>();
  for (const r of run.roster) {
    const name = shortName(r.name);
    if (!byName.has(name)) byName.set(name, { ...r, name });
  }
  const roster = [...byName.values()];
  const tank = run.tank ? shortName(run.tank) : null;
  return roster
    .flatMap((member) => [
      ...deathFindings(run, member.name),
      ...kickFinding(run, member.name),
      ...damageFinding(member, roster, tank),
    ])
    .sort((a, b) => b.weight - a.weight);
}
