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
    links: {
      byCharacter: FunctionReference<
        "query",
        "internal",
        { characterId: string; guildId: string },
        any,
        Name
      >;
      bySlug: FunctionReference<
        "query",
        "internal",
        { guildId: string; slug: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; linkId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          avatarUrl: string | null;
          characterId: string;
          checkedAt: number | null;
          classMismatch: boolean;
          equipment: Array<{
            itemId: number;
            itemLevel: number | null;
            name: string | null;
            quality: string | null;
            slot: string;
          }>;
          error: string | null;
          fetchedAt: number | null;
          guildId: string;
          linkedAt: number;
          linkedBy: string;
          name: string;
          profile: {
            activeSpec: string | null;
            averageItemLevel: number | null;
            blizzardId: number;
            className: string | null;
            equippedItemLevel: number | null;
            faction: string | null;
            guildName: string | null;
            guildSlug: string | null;
            lastLoginAt: number | null;
            level: number;
            name: string;
            raceName: string | null;
            surname: string;
          } | null;
          requestedAt: number;
          slug: string;
          status: "pending" | "found" | "not-found" | "error";
          surname: string;
        },
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
      remove: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; linkId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          linkId: string;
          patch: {
            avatarUrl?: string | null;
            checkedAt?: number | null;
            classMismatch?: boolean;
            equipment?: Array<{
              itemId: number;
              itemLevel: number | null;
              name: string | null;
              quality: string | null;
              slot: string;
            }>;
            error?: string | null;
            fetchedAt?: number | null;
            linkedAt?: number;
            linkedBy?: string;
            name?: string;
            profile?: {
              activeSpec: string | null;
              averageItemLevel: number | null;
              blizzardId: number;
              className: string | null;
              equippedItemLevel: number | null;
              faction: string | null;
              guildName: string | null;
              guildSlug: string | null;
              lastLoginAt: number | null;
              level: number;
              name: string;
              raceName: string | null;
              surname: string;
            } | null;
            requestedAt?: number;
            slug?: string;
            status?: "pending" | "found" | "not-found" | "error";
            surname?: string;
          };
        },
        any,
        Name
      >;
    };
    roster: {
      bySlug: FunctionReference<
        "query",
        "internal",
        { guildId: string; slug: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          activeSpec: string | null;
          avatarUrl: string | null;
          blizzardId: number;
          checkedAt: number | null;
          className: string | null;
          error: string | null;
          guildId: string;
          guildRank: number;
          level: number;
          name: string;
          professions: Array<{
            level: number;
            maxLevel: number | null;
            name: string;
          }>;
          profileUrl: string | null;
          raceName: string | null;
          slug: string;
          status: "pending" | "found" | "error";
          surname: string;
        },
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
      remove: FunctionReference<
        "mutation",
        "internal",
        { entryId: string; guildId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          entryId: string;
          guildId: string;
          patch: {
            activeSpec?: string | null;
            avatarUrl?: string | null;
            checkedAt?: number | null;
            className?: string | null;
            error?: string | null;
            guildRank?: number;
            level?: number;
            name?: string;
            professions?: Array<{
              level: number;
              maxLevel: number | null;
              name: string;
            }>;
            profileUrl?: string | null;
            raceName?: string | null;
            slug?: string;
            status?: "pending" | "found" | "error";
            surname?: string;
          };
        },
        any,
        Name
      >;
    };
  };
