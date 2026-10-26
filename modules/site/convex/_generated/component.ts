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
    profile: {
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
          aboutLead: string;
          aboutSections: Array<{ body: string; heading: string }>;
          contactEmail: string | null;
          discordInvite: string | null;
          guildId: string;
          intro: string;
          pills: Array<string>;
          updatedAt: number;
          updatedBy: string;
        },
        any,
        Name
      >;
    };
    recruiting: {
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
          guildId: string;
          headline: string;
          needs: Array<{
            need: "high" | "medium" | "closed";
            specs: string;
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
          }>;
          pitch: string;
          updatedAt: number;
          updatedBy: string;
        },
        any,
        Name
      >;
    };
  };
