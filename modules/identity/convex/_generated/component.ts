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
    characters: {
      get: FunctionReference<
        "query",
        "internal",
        { characterId: string; guildId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          class: string;
          guildId: string;
          isMain: boolean;
          memberId: string;
          name: string;
          role: "tank" | "healer" | "melee" | "ranged";
          spec: string;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { guildId: string; memberId?: string },
        any,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { characterId: string; guildId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          characterId: string;
          guildId: string;
          patch: {
            class?: string;
            isMain?: boolean;
            name?: string;
            role?: "tank" | "healer" | "melee" | "ranged";
            spec?: string;
          };
        },
        any,
        Name
      >;
    };
    members: {
      byDiscordId: FunctionReference<
        "query",
        "internal",
        { discordId: string; guildId: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; memberId: string },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        any,
        Name
      >;
      setPrefs: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          memberId: string;
          prefs: {
            defaultCharacterId?: string;
            dmOptOut: boolean;
            timezone?: string;
          };
        },
        any,
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          discordId: string;
          displayName: string;
          guildId: string;
          rank:
            | "officer"
            | "raid-leader"
            | "raider"
            | "flex-raider"
            | "recruit"
            | "member"
            | "friend"
            | null;
          rankSince: number | null;
          roleIds: Array<string>;
          syncedAt: number;
          tier:
            "public" | "member" | "recruit" | "raider" | "leader" | "officer";
        },
        any,
        Name
      >;
    };
    roleRanks: {
      list: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        any,
        Name
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          entries: Array<{
            discordRoleId: string;
            rank:
              | "officer"
              | "raid-leader"
              | "raider"
              | "flex-raider"
              | "recruit"
              | "member"
              | "friend";
          }>;
          guildId: string;
        },
        any,
        Name
      >;
    };
  };
