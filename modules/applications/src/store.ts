import { commandsFor } from '@vintage/guild-kit';
import type {
  Application,
  ApplicationLabels,
  ApplicationStatus,
  ApplicationsConfig,
} from './contract';

export interface ApplicationFilter {
  discordId?: string;
  statuses?: readonly ApplicationStatus[];
  /** createdAt at or after. */
  since?: number;
  limit?: number;
}

/** The applications module's data port. Production: the component; tests: `./testing`. */
export interface ApplicationsStore {
  insert(application: Omit<Application, 'id'>): Promise<Application>;
  get(guildId: string, applicationId: string): Promise<Application | null>;
  update(
    guildId: string,
    applicationId: string,
    patch: Partial<
      Pick<
        Application,
        | 'status'
        | 'labels'
        | 'reply'
        | 'reviewedBy'
        | 'reviewedAt'
        | 'postChannelId'
        | 'postMessageId'
        | 'onboardedAt'
        | 'updatedAt'
      >
    >,
  ): Promise<Application>;
  /** Newest first. */
  list(guildId: string, filter?: ApplicationFilter): Promise<Application[]>;
  getConfig(guildId: string): Promise<ApplicationsConfig>;
  setConfig(
    guildId: string,
    patch: Partial<
      Pick<
        ApplicationsConfig,
        'channelId' | 'onboarding' | 'limitCount' | 'limitWindowMinutes' | 'limitAlertedAt'
      >
    >,
    now: number,
  ): Promise<ApplicationsConfig>;
}

/**
 * What happens outside the transaction after a change (apps/api schedules them): label and post a
 * new application; on accept, onboard the applicant at once if role sync already promoted them;
 * send the onboarding DM; send the officers' reply; and refresh the review post.
 */
export interface ApplicationEffects {
  submitted(guildId: string, applicationId: string): Promise<void>;
  accepted(guildId: string, applicationId: string): Promise<void>;
  onboard(guildId: string, applicationId: string): Promise<void>;
  replied(guildId: string, applicationId: string): Promise<void>;
  changed(guildId: string, applicationId: string): Promise<void>;
  /** The rolling limit was reached: tell the officers once (#145). */
  limitReached(guildId: string, retryAt: number): Promise<void>;
}

/** Whether a Discord account is in the Vintage server (identity's members, read by apps/api). */
export interface ApplicationMembers {
  inServer(guildId: string, discordId: string): Promise<boolean>;
}

/** Read from identity's role → rank map by apps/api: which Discord role makes someone a recruit. */
export interface ApplicationRoles {
  recruitRoleId(guildId: string): Promise<string | null>;
}

export interface ApplicationsDeps {
  applications: ApplicationsStore;
  applicationEffects: ApplicationEffects;
  applicationRoles: ApplicationRoles;
  applicationMembers: ApplicationMembers;
}

export type { ApplicationLabels };

export const command = commandsFor<ApplicationsDeps>();
