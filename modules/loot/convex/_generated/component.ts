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
    awards: {
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          awardedAt: number;
          awardedBy: string;
          characterId: string;
          characterName: string;
          configVersion: number;
          eventId: string;
          guildId: string;
          intent: "mainspec" | "offspec" | "transmog" | "disenchant" | "other";
          itemId: number;
          itemName: string | null;
          memberId: string | null;
          methodId: string;
          methodVersion: number;
          note: string | null;
          roll: number | null;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          characterId?: string;
          eventId?: string;
          guildId: string;
          limit?: number;
        },
        any,
        Name
      >;
    };
    configs: {
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; methodId: string },
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
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          config: any;
          configVersion: number;
          guildId: string;
          methodId: string;
          methodVersion: number;
          state: any;
          updatedAt: number;
          updatedBy: string;
        },
        any,
        Name
      >;
    };
    drops: {
      list: FunctionReference<
        "query",
        "internal",
        { eventId: string; guildId: string },
        any,
        Name
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          drops: Array<{
            at: number;
            characterId: string | null;
            count: number;
            itemId: number;
            itemName: string | null;
            lootMethodId: string | null;
            looter: string;
            memberId: string | null;
            recordedAt: number;
            source: string | null;
          }>;
          eventId: string;
          guildId: string;
        },
        any,
        Name
      >;
    };
  };
