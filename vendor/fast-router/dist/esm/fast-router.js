import { FASTElement } from "@lushly-dev/fast-element";
import { Router } from "./router.js";
/**
 * @beta
 */
export class FASTRouter extends Router.from(FASTElement) {
}
/**
 * Resolves when the default `fast-router` element has been registered.
 *
 * @remarks
 * FAST Element v3 registration is asynchronous. Consumers that create the
 * element immediately after importing this package can await this promise.
 *
 * @beta
 */
export const fastRouterRegistration = FASTElement.define(FASTRouter, "fast-router");
