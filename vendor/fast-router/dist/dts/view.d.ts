import { ComposableStyles, ExecutionContext, ViewTemplate } from "@lushly-dev/fast-element";
import { Router } from "./router.js";
/**
 * @beta
 */
export type RouterExecutionContext = ExecutionContext & {
    router?: Router;
};
/**
 * @beta
 */
export interface RouteView {
    context: RouterExecutionContext;
    bind(allTypedParams: Readonly<Record<string, any>>): void;
    appendTo(host: HTMLElement): void;
    dispose(): void;
}
/**
 * @beta
 */
export interface Transition {
    begin(host: HTMLElement, prev: RouteView | null, next: RouteView): Promise<void>;
    rollback(host: HTMLElement, prev: RouteView | null, next: RouteView): Promise<void>;
    commit(host: HTMLElement, prev: RouteView | null, next: RouteView): Promise<void>;
}
/**
 * @beta
 */
export declare const Transition: Readonly<{
    default: Readonly<Transition>;
}>;
/**
 * @beta
 */
export interface Layout {
    beforeCommit(routerElement: HTMLElement): Promise<void>;
    afterCommit(routerElement: HTMLElement): Promise<void>;
}
/**
 * @beta
 */
export declare class FASTElementLayout implements Layout {
    private readonly template;
    private runBeforeCommit;
    private styles;
    constructor(template?: ViewTemplate | null, styles?: ComposableStyles | ComposableStyles[] | undefined, runBeforeCommit?: boolean);
    beforeCommit(routerElement: HTMLElement): Promise<void>;
    afterCommit(routerElement: HTMLElement): Promise<void>;
    private apply;
}
/**
 * @beta
 */
export declare const Layout: Readonly<{
    default: Readonly<Layout>;
}>;
