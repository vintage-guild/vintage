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
    applications: {
      get: FunctionReference<
        "query",
        "internal",
        { applicationId: string; guildId: string },
        any,
        Name
      >;
      getConfig: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          about: string;
          applicantName: string;
          availability: string;
          characterName: string;
          createdAt: number;
          discordId: string;
          experience: string;
          guildId: string;
          labels: {
            complete: boolean | null;
            fit: number | null;
            labeledAt: number;
            role: "raider" | "flex-raider" | "social" | null;
          } | null;
          onboardedAt?: number | null;
          postChannelId: string | null;
          postMessageId: string | null;
          reply: string | null;
          reviewedAt: number | null;
          reviewedBy: string | null;
          role: "raider" | "flex-raider";
          spec: string;
          status: "new" | "in-review" | "accepted" | "declined" | "withdrawn";
          updatedAt: number;
          wowClass:
            | "warrior"
            | "paladin"
            | "hunter"
            | "rogue"
            | "priest"
            | "shaman"
            | "mage"
            | "warlock"
            | "druid";
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          discordId?: string;
          guildId: string;
          limit?: number;
          since?: number;
          statuses?: Array<
            "new" | "in-review" | "accepted" | "declined" | "withdrawn"
          >;
        },
        any,
        Name
      >;
      putConfig: FunctionReference<
        "mutation",
        "internal",
        {
          channelId: string | null;
          guildId: string;
          limitAlertedAt?: number | null;
          limitCount?: number;
          limitWindowMinutes?: number;
          onboarding: string;
          updatedAt: number;
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          applicationId: string;
          guildId: string;
          patch: {
            labels?: {
              complete: boolean | null;
              fit: number | null;
              labeledAt: number;
              role: "raider" | "flex-raider" | "social" | null;
            } | null;
            onboardedAt?: number | null;
            postChannelId?: string | null;
            postMessageId?: string | null;
            reply?: string | null;
            reviewedAt?: number | null;
            reviewedBy?: string | null;
            status?:
              "new" | "in-review" | "accepted" | "declined" | "withdrawn";
            updatedAt?: number;
          };
        },
        any,
        Name
      >;
    };
  };
