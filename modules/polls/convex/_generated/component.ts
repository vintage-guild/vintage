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
    polls: {
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; pollId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          anonymous: boolean;
          closedAt: number | null;
          closedBy: string | null;
          closesAt: number | null;
          configVersion: number;
          createdAt: number;
          createdBy: string;
          description: string | null;
          eligibleTier:
            | "public"
            | "friend"
            | "member"
            | "recruit"
            | "raider"
            | "leader"
            | "officer";
          guildId: string;
          maxChoices: number | null;
          method: "single" | "multi" | "ranked";
          opensAt: number | null;
          options: Array<{
            emoji: string | null;
            id: string;
            label: string;
            value: string | null;
          }>;
          question: string;
          quorum: number | null;
          results: {
            ballots: number;
            method: "single" | "multi" | "ranked";
            options: Array<{ optionId: string; votes: number }>;
            quorumMet: boolean;
            rounds: null | Array<{
              counts: Array<{ optionId: string; votes: number }>;
              eliminated: Array<string>;
            }>;
            winners: Array<string>;
          } | null;
          resultsVisible: "live" | "after-close" | "officers";
          status: "draft" | "open" | "closed" | "cancelled";
          tags: Array<string>;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          closesBy?: number;
          guildId: string;
          statuses?: Array<"draft" | "open" | "closed" | "cancelled">;
          tag?: string;
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
            anonymous?: boolean;
            closedAt?: number | null;
            closedBy?: string | null;
            closesAt?: number | null;
            configVersion?: number;
            createdAt?: number;
            createdBy?: string;
            description?: string | null;
            eligibleTier?:
              | "public"
              | "friend"
              | "member"
              | "recruit"
              | "raider"
              | "leader"
              | "officer";
            maxChoices?: number | null;
            method?: "single" | "multi" | "ranked";
            opensAt?: number | null;
            options?: Array<{
              emoji: string | null;
              id: string;
              label: string;
              value: string | null;
            }>;
            question?: string;
            quorum?: number | null;
            results?: {
              ballots: number;
              method: "single" | "multi" | "ranked";
              options: Array<{ optionId: string; votes: number }>;
              quorumMet: boolean;
              rounds: null | Array<{
                counts: Array<{ optionId: string; votes: number }>;
                eliminated: Array<string>;
              }>;
              winners: Array<string>;
            } | null;
            resultsVisible?: "live" | "after-close" | "officers";
            status?: "draft" | "open" | "closed" | "cancelled";
            tags?: Array<string>;
          };
          pollId: string;
        },
        any,
        Name
      >;
    };
    posts: {
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          channelId: string;
          guildId: string;
          messageId: string;
          pollId: string;
          renderedKey: string;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { guildId: string; pollId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; patch: { renderedKey?: string }; postId: string },
        any,
        Name
      >;
    };
    surveys: {
      countResponses: FunctionReference<
        "query",
        "internal",
        { guildId: string; surveyId: string },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { guildId: string; surveyId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          anonymous: boolean;
          closedAt: number | null;
          closedBy: string | null;
          closesAt: number | null;
          configVersion: number;
          createdAt: number;
          createdBy: string;
          description: string | null;
          eligibleTier:
            | "public"
            | "friend"
            | "member"
            | "recruit"
            | "raider"
            | "leader"
            | "officer";
          guildId: string;
          opensAt: number | null;
          questions: Array<{
            id: string;
            kind: "single" | "multi" | "ranked" | "text";
            maxChoices: number | null;
            options: Array<{
              emoji: string | null;
              id: string;
              label: string;
              value: string | null;
            }>;
            prompt: string;
            required: boolean;
          }>;
          results: {
            questions: Array<
              | {
                  kind: "single" | "multi" | "ranked";
                  prompt: string;
                  questionId: string;
                  tally: {
                    ballots: number;
                    method: "single" | "multi" | "ranked";
                    options: Array<{ optionId: string; votes: number }>;
                    quorumMet: boolean;
                    rounds: null | Array<{
                      counts: Array<{ optionId: string; votes: number }>;
                      eliminated: Array<string>;
                    }>;
                    winners: Array<string>;
                  };
                }
              | {
                  answers: Array<{
                    displayName: string | null;
                    memberId: string | null;
                    text: string;
                  }>;
                  kind: "text";
                  prompt: string;
                  questionId: string;
                  responses: number;
                }
            >;
            responses: number;
          } | null;
          resultsVisible: "live" | "after-close" | "officers";
          status: "draft" | "open" | "closed" | "cancelled";
          tags: Array<string>;
          title: string;
        },
        any,
        Name
      >;
      insertPost: FunctionReference<
        "mutation",
        "internal",
        {
          channelId: string;
          guildId: string;
          messageId: string;
          renderedKey: string;
          surveyId: string;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          closesBy?: number;
          guildId: string;
          statuses?: Array<"draft" | "open" | "closed" | "cancelled">;
          tag?: string;
        },
        any,
        Name
      >;
      listPosts: FunctionReference<
        "query",
        "internal",
        { guildId: string; surveyId: string },
        any,
        Name
      >;
      listResponses: FunctionReference<
        "query",
        "internal",
        { guildId: string; surveyId: string },
        any,
        Name
      >;
      responseByMember: FunctionReference<
        "query",
        "internal",
        { guildId: string; memberId: string; surveyId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            anonymous?: boolean;
            closedAt?: number | null;
            closedBy?: string | null;
            closesAt?: number | null;
            configVersion?: number;
            description?: string | null;
            eligibleTier?:
              | "public"
              | "friend"
              | "member"
              | "recruit"
              | "raider"
              | "leader"
              | "officer";
            opensAt?: number | null;
            questions?: Array<{
              id: string;
              kind: "single" | "multi" | "ranked" | "text";
              maxChoices: number | null;
              options: Array<{
                emoji: string | null;
                id: string;
                label: string;
                value: string | null;
              }>;
              prompt: string;
              required: boolean;
            }>;
            results?: {
              questions: Array<
                | {
                    kind: "single" | "multi" | "ranked";
                    prompt: string;
                    questionId: string;
                    tally: {
                      ballots: number;
                      method: "single" | "multi" | "ranked";
                      options: Array<{ optionId: string; votes: number }>;
                      quorumMet: boolean;
                      rounds: null | Array<{
                        counts: Array<{ optionId: string; votes: number }>;
                        eliminated: Array<string>;
                      }>;
                      winners: Array<string>;
                    };
                  }
                | {
                    answers: Array<{
                      displayName: string | null;
                      memberId: string | null;
                      text: string;
                    }>;
                    kind: "text";
                    prompt: string;
                    questionId: string;
                    responses: number;
                  }
              >;
              responses: number;
            } | null;
            resultsVisible?: "live" | "after-close" | "officers";
            status?: "draft" | "open" | "closed" | "cancelled";
            tags?: Array<string>;
            title?: string;
          };
          surveyId: string;
        },
        any,
        Name
      >;
      updatePost: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; patch: { renderedKey?: string }; postId: string },
        any,
        Name
      >;
      upsertResponse: FunctionReference<
        "mutation",
        "internal",
        {
          answers: Array<{
            choices: Array<string>;
            questionId: string;
            text: string | null;
          }>;
          guildId: string;
          memberId: string;
          submittedAt: number;
          surveyId: string;
          updatedAt: number;
        },
        any,
        Name
      >;
    };
    votes: {
      byMember: FunctionReference<
        "query",
        "internal",
        { guildId: string; memberId: string; pollId: string },
        any,
        Name
      >;
      count: FunctionReference<
        "query",
        "internal",
        { guildId: string; pollId: string },
        any,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          castAt: number;
          choices: Array<string>;
          guildId: string;
          memberId: string;
          pollId: string;
          updatedAt: number;
          weight: number;
        },
        any,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { guildId: string; pollId: string },
        any,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; voteId: string },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          patch: {
            choices?: Array<string>;
            updatedAt?: number;
            weight?: number;
          };
          voteId: string;
        },
        any,
        Name
      >;
    };
  };
