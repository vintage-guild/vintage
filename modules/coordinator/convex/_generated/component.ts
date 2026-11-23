/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    actions: {
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          guildId: string;
          now: number;
          rule: string;
          staleMs: number;
          target: string;
        },
        any,
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          actionId: string;
          detail: string | null;
          discordMessageId: string | null;
          guildId: string;
          now: number;
          renderHash: string | null;
          status: "pending" | "sent" | "skipped" | "failed";
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { eventIds?: Array<string>; guildId: string; limit?: number },
        any,
        Name
      >;
      setRenderHash: FunctionReference<
        "mutation",
        "internal",
        { actionId: string; guildId: string; renderHash: string },
        any,
        Name
      >;
    };
    announcedState: {
      listByEvents: FunctionReference<
        "query",
        "internal",
        { eventIds: Array<string>; guildId: string },
        any,
        Name
      >;
      upsertMany: FunctionReference<
        "mutation",
        "internal",
        {
          rows: Array<{
            absenceSummary: string | null;
            announcedAt: number;
            characterName: string | null;
            class: string | null;
            eventId: string;
            group: number | null;
            guildId: string;
            lateMinutes: 5 | 15 | 30 | null;
            memberId: string;
            note: string | null;
            role: "tank" | "healer" | "melee" | "ranged" | null;
            roster: "pending" | "rostered" | "benched" | null;
            seated: boolean;
            signupId: string | null;
            spec: string | null;
            status:
              "accepted" | "late" | "tentative" | "bench" | "declined" | null;
            updatedAt: number;
            updatedBy: string | null;
          }>;
        },
        any,
        Name
      >;
    };
    config: {
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        any,
        Name
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            dmRanks?: Array<
              | "officer"
              | "raid-leader"
              | "raider"
              | "flex-raider"
              | "recruit"
              | "member"
              | "friend"
            > | null;
            dmReminders: boolean;
            expectedRanks: Array<
              | "officer"
              | "raid-leader"
              | "raider"
              | "flex-raider"
              | "recruit"
              | "member"
              | "friend"
            >;
            leadsChannelId?: string | null;
            openSignupChannelId?: string | null;
            opsChannelId: string | null;
            paused: boolean;
            reminderRoleIds?: Array<string>;
            serverEvents?: boolean;
            signupChannelId: string | null;
            weeklyAssessment?: boolean;
          };
          guildId: string;
          updatedAt: number;
        },
        any,
        Name
      >;
    };
    raidNights: {
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          access?: "guild" | "open";
          createdAt: number;
          createdBy: string;
          detail: string | null;
          durationMinutes: number;
          guildId: string;
          instance: string;
          kind?: "raid" | "dungeon" | "battleground" | "other";
          name: string;
          outcome: "pending" | "created" | "unresolved" | "cancelled";
          pollId: string;
          raidEventId: string | null;
          roleTargets?:
            | { healer: number; melee: number; ranged: number; tank: number }
            | { dps: number; healer: number; tank: number }
            | null;
          size: number | null;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          guildId: string;
          outcome?: "pending" | "created" | "unresolved" | "cancelled";
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            detail?: string | null;
            outcome?: "pending" | "created" | "unresolved" | "cancelled";
            raidEventId?: string | null;
          };
          raidNightId: string;
        },
        any,
        Name
      >;
    };
  };
