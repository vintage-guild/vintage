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
    raidEvents: {
      get: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          configVersion: number;
          durationMinutes: number;
          guildId: string;
          instance: string;
          kind?: "raid" | "dungeon" | "battleground" | "other";
          lootMethodId: string | null;
          name: string;
          roleTargets: { dps: number; healer: number; tank: number } | null;
          scheduleId: string | null;
          size: number | null;
          startsAt: number;
          status: "open" | "locked" | "cancelled" | "completed";
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          from?: number;
          guildId: string;
          scheduleId?: string;
          statuses?: Array<"open" | "locked" | "cancelled" | "completed">;
          to?: number;
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          guildId: string;
          patch: {
            configVersion?: number;
            durationMinutes?: number;
            instance?: string;
            kind?: "raid" | "dungeon" | "battleground" | "other";
            lootMethodId?: string | null;
            name?: string;
            roleTargets?: { dps: number; healer: number; tank: number } | null;
            scheduleId?: string | null;
            size?: number | null;
            startsAt?: number;
            status?: "open" | "locked" | "cancelled" | "completed";
          };
        },
        any,
        Name
      >;
    };
    schedules: {
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; scheduleId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          active: boolean;
          configVersion: number;
          durationMinutes: number;
          guildId: string;
          instance: string;
          kind?: "raid" | "dungeon" | "battleground" | "other";
          lootMethodId: string | null;
          name: string;
          recurrence: {
            time: string;
            timeZone: string;
            weekdays: Array<
              "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
            >;
          };
          roleTargets: { dps: number; healer: number; tank: number } | null;
          size: number | null;
          timings: {
            leadDays: number;
            lockHours: number;
            reminderHours: Array<number>;
          };
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { active?: boolean; guildId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            active?: boolean;
            configVersion?: number;
            durationMinutes?: number;
            instance?: string;
            kind?: "raid" | "dungeon" | "battleground" | "other";
            lootMethodId?: string | null;
            name?: string;
            recurrence?: {
              time: string;
              timeZone: string;
              weekdays: Array<
                "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
              >;
            };
            roleTargets?: { dps: number; healer: number; tank: number } | null;
            size?: number | null;
            timings?: {
              leadDays: number;
              lockHours: number;
              reminderHours: Array<number>;
            };
          };
          scheduleId: string;
        },
        any,
        Name
      >;
    };
    signups: {
      byMember: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string; memberId: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; signupId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          characterId: string;
          characterName: string;
          class: string;
          eventId: string;
          group: number | null;
          guildId: string;
          memberId: string;
          note: string | null;
          promotedAt?: number | null;
          queued?: boolean;
          role: "tank" | "healer" | "melee" | "ranged";
          roster: "pending" | "rostered" | "benched";
          signedUpAt: number;
          spec: string;
          status: "accepted" | "late" | "tentative" | "bench" | "declined";
          updatedAt: number;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string },
        any,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; signupId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            characterId?: string;
            characterName?: string;
            class?: string;
            group?: number | null;
            note?: string | null;
            promotedAt?: number | null;
            queued?: boolean;
            role?: "tank" | "healer" | "melee" | "ranged";
            roster?: "pending" | "rostered" | "benched";
            signedUpAt?: number;
            spec?: string;
            status?: "accepted" | "late" | "tentative" | "bench" | "declined";
            updatedAt?: number;
          };
          signupId: string;
        },
        any,
        Name
      >;
    };
  };
