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
    absences: {
      end: FunctionReference<
        "mutation",
        "internal",
        { absenceId: string; endedAt: number; guildId: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { absenceId: string; guildId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          createdBy: string;
          endedAt: number | null;
          from: string | null;
          guildId: string;
          kind: "dates" | "weekly";
          memberId: string;
          nights: Array<{
            day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
            lateMinutes: 5 | 15 | 30 | null;
            type: "away" | "late";
          }> | null;
          reason: string | null;
          timeZone: string;
          to: string | null;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { activeOnly?: boolean; guildId: string; memberId?: string },
        any,
        Name
      >;
    };
    raidEvents: {
      backfillShortCodes: FunctionReference<
        "mutation",
        "internal",
        { guildId?: string; limit?: number },
        any,
        Name
      >;
      byShortCode: FunctionReference<
        "query",
        "internal",
        { guildId: string; shortCode: string },
        any,
        Name
      >;
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
          access?: "guild" | "open";
          configVersion: number;
          durationMinutes: number;
          guildId: string;
          instance: string;
          kind?: "raid" | "dungeon" | "battleground" | "other";
          lootMethodId: string | null;
          name: string;
          notes?: string | null;
          roleTargets:
            | { healer: number; melee: number; ranged: number; tank: number }
            | { dps: number; healer: number; tank: number }
            | null;
          rosterApprovedAt?: number | null;
          rosterApprovedBy?: string | null;
          scheduleId: string | null;
          shortCode?: string | null;
          size: number | null;
          startsAt: number;
          status: "open" | "locked" | "cancelled" | "completed";
          updatedAt?: number | null;
          updatedBy?: string | null;
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
            access?: "guild" | "open";
            configVersion?: number;
            durationMinutes?: number;
            instance?: string;
            kind?: "raid" | "dungeon" | "battleground" | "other";
            lootMethodId?: string | null;
            name?: string;
            notes?: string | null;
            roleTargets?:
              | { healer: number; melee: number; ranged: number; tank: number }
              | { dps: number; healer: number; tank: number }
              | null;
            rosterApprovedAt?: number | null;
            rosterApprovedBy?: string | null;
            scheduleId?: string | null;
            shortCode?: string | null;
            size?: number | null;
            startsAt?: number;
            status?: "open" | "locked" | "cancelled" | "completed";
            updatedAt?: number | null;
            updatedBy?: string | null;
          };
        },
        any,
        Name
      >;
    };
    records: {
      attendance: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string },
        any,
        Name
      >;
      attendanceByMember: FunctionReference<
        "query",
        "internal",
        { guildId: string; limit: number; memberId: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string },
        any,
        Name
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          attendance: Array<{
            characterId: string | null;
            class: string | null;
            firstSeenAt: number;
            labels: Array<string>;
            lastSeenAt: number;
            memberId: string | null;
            name: string;
            snapshots: number;
            stoodBy?: boolean;
          }>;
          record: {
            addonVersion: string;
            attended: number;
            bosses?: null | {
              firstPullAt: number;
              killed: number;
              lastEndAt: number;
              total: number | null;
              wipes: number;
            };
            drops: number;
            eventId: string;
            exportKey: string;
            exportedAt: number;
            exporter: string;
            guildId: string;
            recordedAt: number;
            recordedBy: string;
            snapshots: number;
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
          access?: "guild" | "open";
          active: boolean;
          configVersion: number;
          durationMinutes: number;
          guildId: string;
          instance: string;
          kind?: "raid" | "dungeon" | "battleground" | "other";
          lootMethodId: string | null;
          name: string;
          notes?: string | null;
          recurrence: {
            time: string;
            timeZone: string;
            weekdays: Array<
              "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
            >;
          };
          roleTargets:
            | { healer: number; melee: number; ranged: number; tank: number }
            | { dps: number; healer: number; tank: number }
            | null;
          size: number | null;
          timings: {
            digestHours?: number;
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
            access?: "guild" | "open";
            active?: boolean;
            configVersion?: number;
            durationMinutes?: number;
            instance?: string;
            kind?: "raid" | "dungeon" | "battleground" | "other";
            lootMethodId?: string | null;
            name?: string;
            notes?: string | null;
            recurrence?: {
              time: string;
              timeZone: string;
              weekdays: Array<
                "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
              >;
            };
            roleTargets?:
              | { healer: number; melee: number; ranged: number; tank: number }
              | { dps: number; healer: number; tank: number }
              | null;
            size?: number | null;
            timings?: {
              digestHours?: number;
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
          alsoRoles?: Array<"tank" | "healer" | "melee" | "ranged">;
          characterId: string;
          characterName: string;
          class: string;
          eventId: string;
          group: number | null;
          guildId: string;
          lateMinutes?: 5 | 15 | 30 | null;
          memberId: string;
          note: string | null;
          promotedAt?: number | null;
          queued?: boolean;
          role: "tank" | "healer" | "melee" | "ranged";
          rolePicked?: boolean;
          roster: "pending" | "rostered" | "benched";
          signedUpAt: number;
          spec: string;
          status: "accepted" | "late" | "tentative" | "bench" | "declined";
          updatedAt: number;
          updatedBy?: string | null;
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
      listByMember: FunctionReference<
        "query",
        "internal",
        { guildId: string; limit: number; memberId: string },
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
            alsoRoles?: Array<"tank" | "healer" | "melee" | "ranged">;
            characterId?: string;
            characterName?: string;
            class?: string;
            group?: number | null;
            lateMinutes?: 5 | 15 | 30 | null;
            note?: string | null;
            promotedAt?: number | null;
            queued?: boolean;
            role?: "tank" | "healer" | "melee" | "ranged";
            rolePicked?: boolean;
            roster?: "pending" | "rostered" | "benched";
            signedUpAt?: number;
            spec?: string;
            status?: "accepted" | "late" | "tentative" | "bench" | "declined";
            updatedAt?: number;
            updatedBy?: string | null;
          };
          signupId: string;
        },
        any,
        Name
      >;
    };
  };
