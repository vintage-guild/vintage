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
          effort: "none" | "minimal" | "low" | "medium" | "high";
          guildId: string;
          guildMonthlyAsks: number;
          guildMonthlyDecisions: number;
          memberDailyAsks: number;
          model: string;
          paused: boolean;
          updatedAt: number;
          updatedBy: string | null;
        },
        any,
        Name
      >;
    };
    confirmations: {
      byRun: FunctionReference<
        "query",
        "internal",
        { guildId: string; runId: string },
        any,
        Name
      >;
      expired: FunctionReference<
        "query",
        "internal",
        { guildId: string; now: number },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { confirmationId: string; guildId: string },
        any,
        Name
      >;
      getToolResult: FunctionReference<
        "query",
        "internal",
        { callId: string; guildId: string; runId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          command: string;
          confirmToken: string | null;
          createdAt: number;
          expiresAt: number;
          finishedAt: number | null;
          guildId: string;
          input: any;
          memberId: string;
          preview: any;
          result: any;
          runId: string;
          status: "pending" | "done" | "failed" | "declined" | "expired";
          summary: string;
        },
        any,
        Name
      >;
      putToolResult: FunctionReference<
        "mutation",
        "internal",
        {
          callId: string;
          error: string | null;
          guildId: string;
          output: string;
          runId: string;
          success: boolean;
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          confirmationId: string;
          guildId: string;
          patch: {
            finishedAt?: number | null;
            result?: any;
            status?: "pending" | "done" | "failed" | "declined" | "expired";
          };
        },
        any,
        Name
      >;
    };
    runs: {
      count: FunctionReference<
        "query",
        "internal",
        {
          guildId: string;
          kind?: "ask" | "wording" | "decision";
          memberId?: string;
          since?: number;
          statuses?: Array<
            "queued" | "running" | "answered" | "failed" | "cancelled"
          >;
          threadKey?: string;
        },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; runId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          answer: string | null;
          cancelRequested?: boolean;
          confirmationIds: Array<string>;
          context?: {
            page: string;
            selection?: {
              id: string;
              kind:
                | "raid"
                | "application"
                | "poll"
                | "member"
                | "character"
                | "run";
              label: string;
            };
          } | null;
          createdAt: number;
          draft?: string | null;
          error: string | null;
          finishedAt: number | null;
          guildId: string;
          inputTokens: number | null;
          kind: "ask" | "wording" | "decision";
          label: string | null;
          memberId: string | null;
          model: string | null;
          notes?: Array<string>;
          prompt: string;
          sessionId: string | null;
          status: "queued" | "running" | "answered" | "failed" | "cancelled";
          surface: string;
          threadKey: string | null;
          toolCalls: Array<{
            command: string | null;
            error?: string | null;
            finishedAt?: number | null;
            name: string;
            startedAt?: number | null;
            success: boolean;
            summary?: string | null;
          }>;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          guildId: string;
          kind?: "ask" | "wording" | "decision";
          limit?: number;
          memberId?: string;
          since?: number;
          statuses?: Array<
            "queued" | "running" | "answered" | "failed" | "cancelled"
          >;
          threadKey?: string;
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            answer?: string | null;
            cancelRequested?: boolean;
            confirmationIds?: Array<string>;
            context?: {
              page: string;
              selection?: {
                id: string;
                kind:
                  | "raid"
                  | "application"
                  | "poll"
                  | "member"
                  | "character"
                  | "run";
                label: string;
              };
            } | null;
            draft?: string | null;
            error?: string | null;
            finishedAt?: number | null;
            inputTokens?: number | null;
            kind?: "ask" | "wording" | "decision";
            label?: string | null;
            memberId?: string | null;
            model?: string | null;
            notes?: Array<string>;
            prompt?: string;
            sessionId?: string | null;
            status?: "queued" | "running" | "answered" | "failed" | "cancelled";
            surface?: string;
            threadKey?: string | null;
            toolCalls?: Array<{
              command: string | null;
              error?: string | null;
              finishedAt?: number | null;
              name: string;
              startedAt?: number | null;
              success: boolean;
              summary?: string | null;
            }>;
          };
          runId: string;
        },
        any,
        Name
      >;
    };
    sessions: {
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; threadKey: string },
        any,
        Name
      >;
      idle: FunctionReference<
        "query",
        "internal",
        { before: number; guildId: string },
        any,
        Name
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          guildId: string;
          lastUsedAt: number;
          memberId: string;
          sessionId: string;
          threadKey: string;
        },
        any,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; threadKey: string },
        any,
        Name
      >;
    };
    usage: {
      bump: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; key: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; key: string },
        any,
        Name
      >;
    };
  };
