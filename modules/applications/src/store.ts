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
        | 'updatedAt'
      >
    >,
  ): Promise<Application>;
  /** Newest first. */
  list(guildId: string, filter?: ApplicationFilter): Promise<Application[]>;
  getConfig(guildId: string): Promise<ApplicationsConfig>;
  setConfig(
    guildId: string,
    patch: Partial<Pick<ApplicationsConfig, 'channelId' | 'onboarding'>>,
    now: number,
  ): Promise<ApplicationsConfig>;
}

/**
 * What happens outside the transaction after a change (apps/api schedules actions): label and
 * post a new application, send an accepted applicant the onboarding DM (and ask officers to give
 * the recruit role), send the officers' reply, and refresh the review post.
 */
export interface ApplicationEffects {
  submitted(guildId: string, applicationId: string): Promise<void>;
  accepted(guildId: string, applicationId: string): Promise<void>;
  replied(guildId: string, applicationId: string): Promise<void>;
  changed(guildId: string, applicationId: string): Promise<void>;
}

export interface ApplicationsDeps {
  applications: ApplicationsStore;
  applicationEffects: ApplicationEffects;
}

export type { ApplicationLabels };

export const command = commandsFor<ApplicationsDeps>();
