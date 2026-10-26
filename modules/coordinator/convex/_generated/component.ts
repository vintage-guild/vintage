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
    actions: {
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          guildId: string;
          now: number;
          rule: string;
          staleMs: number;
          target: string;
        },
        any,
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          actionId: string;
          detail: string | null;
          discordMessageId: string | null;
          guildId: string;
          now: number;
          renderHash: string | null;
          status: "pending" | "sent" | "skipped" | "failed";
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { eventIds?: Array<string>; guildId: string; limit?: number },
        any,
        Name
      >;
      setRenderHash: FunctionReference<
        "mutation",
        "internal",
        { actionId: string; guildId: string; renderHash: string },
        any,
        Name
      >;
    };
    config: {
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
          config: {
            dmReminders: boolean;
            expectedRanks: Array<
              | "officer"
              | "raid-leader"
              | "raider"
              | "flex-raider"
              | "recruit"
              | "member"
              | "friend"
            >;
            opsChannelId: string | null;
            paused: boolean;
            signupChannelId: string | null;
          };
          guildId: string;
          updatedAt: number;
        },
        any,
        Name
      >;
    };
  };
