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
    entries: {
      listAll: FunctionReference<
        "query",
        "internal",
        {
          characterId?: string;
          guildId: string;
          itemId?: number;
          memberId?: string;
        },
        any,
        Name
      >;
      listByCharacter: FunctionReference<
        "query",
        "internal",
        { characterId: string; guildId: string },
        any,
        Name
      >;
      listByItem: FunctionReference<
        "query",
        "internal",
        { guildId: string; itemId: number },
        any,
        Name
      >;
      replaceForCharacter: FunctionReference<
        "mutation",
        "internal",
        {
          characterId: string;
          entries: Array<{
            characterId: string;
            guildId: string;
            itemId: number;
            itemName: string | null;
            memberId: string;
            note: string | null;
            rank: number;
            updatedAt: number;
            updatedBy: string;
          }>;
          guildId: string;
        },
        any,
        Name
      >;
    };
  };
