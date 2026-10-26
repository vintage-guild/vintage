/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as commands from "../commands.js";
import type * as coordinator from "../coordinator.js";
import type * as crons from "../crons.js";
import type * as discord from "../discord.js";
import type * as http from "../http.js";
import type * as pollPosts from "../pollPosts.js";
import type * as polls from "../polls.js";
import type * as roleSync from "../roleSync.js";
import type * as stores from "../stores.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  commands: typeof commands;
  coordinator: typeof coordinator;
  crons: typeof crons;
  discord: typeof discord;
  http: typeof http;
  pollPosts: typeof pollPosts;
  polls: typeof polls;
  roleSync: typeof roleSync;
  stores: typeof stores;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  identity: import("@vintage/identity/_generated/component.js").ComponentApi<"identity">;
  raids: import("@vintage/raids/_generated/component.js").ComponentApi<"raids">;
  coordinator: import("@vintage/coordinator/_generated/component.js").ComponentApi<"coordinator">;
  polls: import("@vintage/polls/_generated/component.js").ComponentApi<"polls">;
  progress: import("@vintage/progress/_generated/component.js").ComponentApi<"progress">;
};
