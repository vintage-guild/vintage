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
    kills: {
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          bossId: string;
          guildId: string;
          killedAt: number;
          loot: Array<{
            name: string;
            quality:
              "poor" | "common" | "uncommon" | "rare" | "epic" | "legendary";
          }>;
          note: string | null;
          raidId: "barrow-deeps" | "hyjal-summit" | "onyxias-lair";
          recordedAt: number;
          recordedBy: string;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          guildId: string;
          raidId?: "barrow-deeps" | "hyjal-summit" | "onyxias-lair";
        },
        any,
        Name
      >;
    };
  };
