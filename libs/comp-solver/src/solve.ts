import { type Role, roleFor } from '@vintage/wow-data';
import {
  type BenchCode,
  COMP_ROLES,
  type CompGap,
  type CompInput,
  type CompResult,
  type CompRole,
  type CompSignup,
  compRoleOf,
  type Decision,
  type Exclusion,
  inputIssues,
  type Provider,
  type RaidSize,
  type Requirement,
  type RoleTargets,
  type SelectionCode,
  type SignupStatus,
} from './types';

interface Candidate {
  signup: CompSignup;
  role: Role;
  bucket: CompRole;
}

const STATUS_ORDER: Record<SignupStatus, number> = {
  accepted: 0,
  late: 1,
  tentative: 2,
  bench: 3,
  declined: 4,
};

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Code-unit order, so the result never depends on the host's locale. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The pick order: status (accepted, late, tentative, bench), then priority (higher first),
 * then signup time (earlier first), then name, then id. Total, so solves are deterministic.
 */
export function compareSignups(a: CompSignup, b: CompSignup): number {
  return (
    compareNumbers(STATUS_ORDER[a.status], STATUS_ORDER[b.status]) ||
    compareNumbers(b.priority ?? 0, a.priority ?? 0) ||
    compareNumbers(a.signedUpAt, b.signedUpAt) ||
    compareStrings(a.name, b.name) ||
    compareStrings(a.id, b.id)
  );
}

function provides(signup: CompSignup, providers: readonly Provider[]): boolean {
  return providers.some(
    (p) => p.class === signup.class && (p.spec === undefined || p.spec === signup.spec),
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const ROLE_NOUN: Record<CompRole, [string, string]> = {
  tank: ['tank', 'tanks'],
  healer: ['healer', 'healers'],
  dps: ['dps', 'dps'],
};

function roleNoun(role: CompRole, n: number): string {
  const [one, many] = ROLE_NOUN[role];
  return plural(n, one, many);
}

function partition(signups: readonly CompSignup[]): {
  candidates: Candidate[];
  excluded: Exclusion[];
} {
  const candidates: Candidate[] = [];
  const excluded: Exclusion[] = [];
  for (const signup of [...signups].sort(compareSignups)) {
    if (signup.status === 'declined') {
      excluded.push({ signup, code: 'declined', reason: 'declined' });
      continue;
    }
    const role = signup.role ?? roleFor(signup.class, signup.spec);
    if (role === undefined) {
      excluded.push({
        signup,
        code: 'unknown-role',
        reason: `${signup.spec} is not a ${signup.class} spec`,
      });
      continue;
    }
    candidates.push({ signup, role, bucket: compRoleOf(role) });
  }
  return { candidates, excluded };
}

/** The roster as it's built: who's in, and how full each role is. */
class Roster {
  readonly picked = new Map<string, Decision<SelectionCode>>();
  readonly counts: Record<CompRole, number> = { tank: 0, healer: 0, dps: 0 };

  constructor(
    readonly raidSize: RaidSize,
    readonly targets: RoleTargets,
  ) {}

  has(c: Candidate): boolean {
    return this.picked.has(c.signup.id);
  }

  hasRoom(bucket: CompRole): boolean {
    return this.counts[bucket] < this.targets[bucket];
  }

  isFull(): boolean {
    return this.picked.size >= this.raidSize;
  }

  shortRoles(): CompRole[] {
    return COMP_ROLES.filter((r) => this.hasRoom(r));
  }

  pick(c: Candidate, code: SelectionCode, reason: string): void {
    this.picked.set(c.signup.id, { signup: c.signup, role: c.role, code, reason });
    this.counts[c.bucket] += 1;
  }

  providerCount(providers: readonly Provider[]): number {
    let n = 0;
    for (const d of this.picked.values()) if (provides(d.signup, providers)) n += 1;
    return n;
  }
}

/** Phase 1: cover each requirement with the best-ranked provider whose role still has room. */
function pickRequirements(
  roster: Roster,
  candidates: readonly Candidate[],
  requirements: readonly Requirement[],
) {
  for (const req of requirements) {
    let have = roster.providerCount(req.providers);
    const need = req.count ?? 1;
    for (const c of candidates) {
      if (have >= need) break;
      if (roster.has(c) || !roster.hasRoom(c.bucket) || !provides(c.signup, req.providers))
        continue;
      roster.pick(c, 'requirement', `provides ${req.label}`);
      have += 1;
    }
  }
}

/** Phase 2: fill each role up to its target, best-ranked first. */
function pickRoles(roster: Roster, candidates: readonly Candidate[]) {
  for (const bucket of COMP_ROLES) {
    for (const c of candidates) {
      if (!roster.hasRoom(bucket)) break;
      if (c.bucket !== bucket || roster.has(c)) continue;
      roster.pick(c, 'role', `${bucket} ${roster.counts[bucket] + 1} of ${roster.targets[bucket]}`);
    }
  }
}

/**
 * Phase 3: fill open slots with whoever's left, best-ranked first. A role goes over its
 * target only here, which means nobody signed up for the roles still short.
 */
function pickFill(roster: Roster, candidates: readonly Candidate[]) {
  const short = roster.shortRoles();
  const reason = short.length > 0 ? `open slot: no ${short.join(' or ')} available` : 'open slot';
  for (const c of candidates) {
    if (roster.isFull()) break;
    if (!roster.has(c)) roster.pick(c, 'fill', reason);
  }
}

/**
 * Anyone left after phase 3 is benched because the raid is full. When their role sits
 * exactly at target, the role is the binding reason; when open slots already took extras
 * of their role, the raid size is.
 */
function benchDecision(roster: Roster, c: Candidate): Decision<BenchCode> {
  const roleFull = roster.counts[c.bucket] <= roster.targets[c.bucket];
  const code: BenchCode = roleFull ? 'role-full' : 'raid-full';
  const why = roleFull
    ? `${c.bucket} slots full (${roster.counts[c.bucket]}/${roster.targets[c.bucket]})`
    : `raid full (${roster.picked.size}/${roster.raidSize})`;
  const reason = c.signup.status === 'bench' ? `signed up as bench; ${why}` : why;
  return { signup: c.signup, role: c.role, code, reason };
}

function roleGaps(roster: Roster): CompGap[] {
  return roster.shortRoles().map((role) => {
    const target = roster.targets[role];
    const have = roster.counts[role];
    const missing = target - have;
    return {
      kind: 'role',
      role,
      target,
      have,
      missing,
      reason: `need ${missing} ${roleNoun(role, missing)}`,
    };
  });
}

function requirementGaps(roster: Roster, requirements: readonly Requirement[]): CompGap[] {
  const gaps: CompGap[] = [];
  for (const req of requirements) {
    const need = req.count ?? 1;
    const have = roster.providerCount(req.providers);
    if (have >= need) continue;
    const missing = need - have;
    const reason = have === 0 ? `no ${req.label}` : `need ${missing} more ${req.label}`;
    gaps.push({ kind: 'requirement', id: req.id, label: req.label, need, have, missing, reason });
  }
  return gaps;
}

/** Open slots that the role gaps don't already account for. */
function sizeGap(roster: Roster, roleMissing: number): CompGap[] {
  const missing = roster.raidSize - roster.picked.size - roleMissing;
  if (missing <= 0) return [];
  const reason = `need ${missing} more ${plural(missing, 'player', 'players')}`;
  return [{ kind: 'size', raidSize: roster.raidSize, have: roster.picked.size, missing, reason }];
}

function bySlot(a: Decision<SelectionCode>, b: Decision<SelectionCode>): number {
  const slot = (d: Decision<SelectionCode>) => COMP_ROLES.indexOf(compRoleOf(d.role));
  return compareNumbers(slot(a), slot(b)) || compareSignups(a.signup, b.signup);
}

/**
 * Pick a raid roster from signups: requirements first, then role targets, then open slots.
 * Pure and deterministic: the same input (in any order) gives the same result.
 * Throws a RangeError when `inputIssues` reports a problem; validate with `compInputSchema`
 * first to turn those into input errors.
 */
export function solveComp(input: CompInput): CompResult {
  const issues = inputIssues(input);
  if (issues.length > 0) throw new RangeError(issues.join('; '));

  const requirements = input.template.requirements ?? [];
  const roster = new Roster(input.raidSize, input.template.targets);
  const { candidates, excluded } = partition(input.signups);

  pickRequirements(roster, candidates, requirements);
  pickRoles(roster, candidates);
  pickFill(roster, candidates);

  const bench = candidates.filter((c) => !roster.has(c)).map((c) => benchDecision(roster, c));
  const selected = [...roster.picked.values()].sort(bySlot);
  const rGaps = roleGaps(roster);
  const roleMissing = rGaps.reduce((n, g) => n + g.missing, 0);
  const gaps = [
    ...rGaps,
    ...requirementGaps(roster, requirements),
    ...sizeGap(roster, roleMissing),
  ];

  return {
    selected,
    bench,
    excluded,
    gaps,
    counts: {
      selected: selected.length,
      raidSize: input.raidSize,
      ...roster.counts,
      melee: selected.filter((d) => d.role === 'melee').length,
      ranged: selected.filter((d) => d.role === 'ranged').length,
      confirmed: selected.filter((d) => d.signup.status === 'accepted').length,
    },
  };
}
