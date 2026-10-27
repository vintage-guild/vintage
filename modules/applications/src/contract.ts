// Public surface of the applications module. Other modules import only this file.
import type { WowClass } from '@vintage/wow-data';

/** Only raiders and flex raiders apply; friends and socials just join (GM, 2026-10-26). */
export const APPLY_ROLES = ['raider', 'flex-raider'] as const;
export type ApplyRole = (typeof APPLY_ROLES)[number];

export const APPLICATION_STATUSES = [
  'new',
  'in-review',
  'accepted',
  'declined',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Open applications block a second one from the same person. */
export const OPEN_STATUSES: readonly ApplicationStatus[] = ['new', 'in-review'];

export const APPLICATION_LIMITS = {
  spec: 40,
  about: 1000,
  experience: 1000,
  availability: 400,
  reply: 1500,
  onboarding: 1500,
} as const;

/** Labels from one Decisions request (#134). Null fields: the model was unsure; show raw. */
export interface ApplicationLabels {
  /** What the text reads as, which can differ from the role they picked. */
  role: ApplyRole | 'social' | null;
  /** Answers every question with real detail. */
  complete: boolean | null;
  /** Fit to the open recruiting needs: 0 poor, 1 partial, 2 good, 3 strong. */
  fit: number | null;
  labeledAt: number;
}

export const FIT_LEVELS = ['poor', 'partial', 'good', 'strong'] as const;

export interface Application {
  id: string;
  guildId: string;
  /** Who applied: their Discord account. */
  discordId: string;
  applicantName: string;
  characterName: string;
  wowClass: WowClass;
  spec: string;
  role: ApplyRole;
  about: string;
  experience: string;
  availability: string;
  status: ApplicationStatus;
  labels: ApplicationLabels | null;
  /** The officers' last reply, also sent to the applicant. */
  reply: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  /** The review post in the recruitment channel, once posted. */
  postChannelId: string | null;
  postMessageId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What the applicant sees of their own application: not the labels, not who reviewed. */
export type OwnApplicationView = Pick<
  Application,
  | 'id'
  | 'characterName'
  | 'wowClass'
  | 'spec'
  | 'role'
  | 'status'
  | 'reply'
  | 'createdAt'
  | 'updatedAt'
>;

export const toOwnView = (a: Application): OwnApplicationView => ({
  id: a.id,
  characterName: a.characterName,
  wowClass: a.wowClass,
  spec: a.spec,
  role: a.role,
  status: a.status,
  reply: a.reply,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export interface ApplicationsConfig {
  guildId: string;
  /** Where new applications are posted for officers (e.g. #recruitment). Null: not posted. */
  channelId: string | null;
  /** The DM an accepted applicant gets. `{site}` is replaced with the website's address. */
  onboarding: string;
  updatedAt: number;
}

export const DEFAULT_ONBOARDING =
  "Welcome to Vintage! You're a recruit now: about two weeks of raiding with us before ranks. " +
  'Sign in at {site} to add your characters and sign up for raids, and say hi in Discord.';

export function defaultApplicationsConfig(guildId: string): ApplicationsConfig {
  return { guildId, channelId: null, onboarding: DEFAULT_ONBOARDING, updatedAt: 0 };
}

export const APPLICATION_COMMANDS = [
  'application-submit',
  'application-get',
  'application-list',
  'application-review',
  'application-decline',
  'application-withdraw',
  'application-config-get',
  'application-config-set',
] as const;
export type ApplicationCommandName = (typeof APPLICATION_COMMANDS)[number];
