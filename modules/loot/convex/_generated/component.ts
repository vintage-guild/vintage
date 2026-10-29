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
