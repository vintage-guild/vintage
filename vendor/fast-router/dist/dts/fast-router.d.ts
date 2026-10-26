import { FASTElement } from "@lushly-dev/fast-element";
import { RouterElement } from "./router.js";
declare const FASTRouter_base: {
    new (): FASTElement & RouterElement;
};
/**
 * @beta
 */
export declare class FASTRouter extends FASTRouter_base {
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
export declare const fastRouterRegistration: Promise<typeof FASTRouter>;
export {};
