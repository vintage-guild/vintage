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
    insights: {
      getOptIn: FunctionReference<
        "query",
        "internal",
        { guildId: string; memberId: string },
        any,
        Name
      >;
      getRun: FunctionReference<
        "query",
        "internal",
        { guildId: string; runId: string },
        any,
        Name
      >;
      getRunByKey: FunctionReference<
        "query",
        "internal",
        { guildId: string; runKey: string },
        any,
        Name
      >;
      insertFindings: FunctionReference<
        "mutation",
        "internal",
        {
          findings: Array<{
            character: string;
            evidence: string;
            guildId: string;
            kind: "deaths" | "killed-by" | "kicks" | "damage-taken";
            memberId: string | null;
            runId: string;
            text: string;
            weight: number;
          }>;
        },
        any,
        Name
      >;
      insertRun: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          durationSeconds: number;
          guildId: string;
          importedBy: string;
          roster: Array<string>;
          runKey: string;
          sentAt: number | null;
          startedAt: number;
          zoneName: string;
        },
        any,
        Name
      >;
      listFindings: FunctionReference<
        "query",
        "internal",
        { guildId: string; runId: string },
        any,
        Name
      >;
      listOptedIn: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        any,
        Name
      >;
      listRuns: FunctionReference<
        "query",
        "internal",
        { guildId: string; limit: number },
        any,
        Name
      >;
      markSent: FunctionReference<
        "mutation",
        "internal",
        { at: number; guildId: string; runId: string },
        any,
        Name
      >;
      setOptIn: FunctionReference<
        "mutation",
        "internal",
        { dms: boolean; guildId: string; memberId: string; updatedAt: number },
        any,
        Name
      >;
    };
  };
