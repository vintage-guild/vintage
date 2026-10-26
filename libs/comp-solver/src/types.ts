import { classSchema, type Role, roleSchema } from '@vintage/wow-data';
import { z } from 'zod';

/** Raid sizes the solver plans for. */
export const RAID_SIZES = [10, 20, 40] as const;
export type RaidSize = (typeof RAID_SIZES)[number];
export const raidSizeSchema = z.union([z.literal(10), z.literal(20), z.literal(40)]);

/**
 * How a member answered the signup post, best first. `declined` is never eligible;
 * `bench` means they volunteered to sit and are picked only when nobody else fits.
 */
export const SIGNUP_STATUSES = ['accepted', 'late', 'tentative', 'bench', 'declined'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];
export const signupStatusSchema = z.enum(SIGNUP_STATUSES);

/** The template buckets: melee and ranged both count as dps. */
export const COMP_ROLES = ['tank', 'healer', 'dps'] as const;
export type CompRole = (typeof COMP_ROLES)[number];

export function compRoleOf(role: Role): CompRole {
  return role === 'melee' || role === 'ranged' ? 'dps' : role;
}

/**
 * One character signed up for one raid. The raids module maps its signups onto this.
 * `role` falls back to the class/spec's role from wow-data when omitted.
 */
export const compSignupSchema = z.object({
  /** Stable id, unique within one solve (the signup or character id). */
  id: z.string().min(1),
  /** Character name, shown in reasons and used as the last tie-break. */
  name: z.string().min(1),
  class: classSchema,
  spec: z.string().min(1),
  role: roleSchema.optional(),
  status: signupStatusSchema,
  /** Higher goes first (e.g. raider over flex raider). Defaults to 0. */
  priority: z.number().finite().optional(),
  /** When they signed up, epoch ms. Earlier goes first. */
  signedUpAt: z.number().finite(),
});
export type CompSignup = z.infer<typeof compSignupSchema>;

/** Matches a signup by class, and by spec when given. */
export const providerSchema = z.object({
  class: classSchema,
  spec: z.string().min(1).optional(),
});
export type Provider = z.infer<typeof providerSchema>;

/** Something the raid needs from specific classes or specs, e.g. Mark of the Wild ⇒ a druid. */
export const requirementSchema = z.object({
  id: z.string().min(1),
  /** Shown in gaps: "no Mark of the Wild". */
  label: z.string().min(1),
  providers: z.array(providerSchema).min(1),
  /** How many providers the raid needs. Defaults to 1. */
  count: z.number().int().min(1).optional(),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const roleTargetsSchema = z.object({
  tank: z.number().int().min(0),
  healer: z.number().int().min(0),
  dps: z.number().int().min(0),
});
export type RoleTargets = z.infer<typeof roleTargetsSchema>;

export const compTemplateSchema = z.object({
  targets: roleTargetsSchema,
  /** Checked in order; earlier requirements pick first. */
  requirements: z.array(requirementSchema).default([]),
});
export type CompTemplate = z.input<typeof compTemplateSchema>;

export const compInputSchema = z
  .object({
    raidSize: raidSizeSchema,
    template: compTemplateSchema,
    signups: z.array(compSignupSchema),
  })
  .superRefine((input, ctx) => {
    for (const issue of inputIssues(input)) ctx.addIssue({ code: 'custom', message: issue });
  });
export type CompInput = z.input<typeof compInputSchema>;

/** Problems that make an input unsolvable. Empty when the input is fine. */
export function inputIssues(input: CompInput): string[] {
  const issues: string[] = [];
  const { tank, healer, dps } = input.template.targets;
  if (tank + healer + dps > input.raidSize) {
    issues.push(`role targets (${tank + healer + dps}) exceed the raid size (${input.raidSize})`);
  }
  const seen = new Set<string>();
  for (const s of input.signups) {
    if (seen.has(s.id)) issues.push(`duplicate signup id: ${s.id}`);
    seen.add(s.id);
  }
  return issues;
}

/** Why a signup was selected. */
export type SelectionCode = 'requirement' | 'role' | 'fill';
/** Why an eligible signup sits on the bench. */
export type BenchCode = 'role-full' | 'raid-full';
/** Why a signup was not considered at all. */
export type ExcludedCode = 'declined' | 'unknown-role';

export interface Decision<Code extends string> {
  signup: CompSignup;
  /** The role this signup plays: given, or derived from class/spec. */
  role: Role;
  code: Code;
  /** Short English reason for posts and digests. */
  reason: string;
}

export interface Exclusion {
  signup: CompSignup;
  code: ExcludedCode;
  reason: string;
}

export type CompGap =
  | { kind: 'role'; role: CompRole; target: number; have: number; missing: number; reason: string }
  | {
      kind: 'requirement';
      id: string;
      label: string;
      need: number;
      have: number;
      missing: number;
      reason: string;
    }
  | { kind: 'size'; raidSize: RaidSize; have: number; missing: number; reason: string };

export interface CompCounts {
  selected: number;
  raidSize: RaidSize;
  tank: number;
  healer: number;
  dps: number;
  melee: number;
  ranged: number;
  /** Selected signups whose status is `accepted`. */
  confirmed: number;
}

export interface CompResult {
  /** Grouped tank, healer, dps; best-ranked first within each group. */
  selected: Decision<SelectionCode>[];
  /** Best-ranked first: the first entry is the first pick if a slot opens. */
  bench: Decision<BenchCode>[];
  /** Declined or unplaceable signups. Not part of `selected` or `bench`. */
  excluded: Exclusion[];
  gaps: CompGap[];
  counts: CompCounts;
}
