import { AddViewBehaviorFactory, ViewBehavior, ViewBehaviorFactory, ViewController } from "@lushly-dev/fast-element";
import { NavigationCommitPhaseHook, NavigationPhaseHook, NavigationPhaseName } from "./phases.js";
/**
 * @beta
 */
export type NavigationContributor<TSettings = any> = Partial<Record<Exclude<NavigationPhaseName, "commit">, NavigationPhaseHook<TSettings>>> & {
    commit?: NavigationCommitPhaseHook<TSettings>;
};
/**
 * @beta
 */
export declare function isNavigationPhaseContributor<T extends NavigationPhaseName>(object: any, phase: T): object is Record<T, NavigationPhaseHook>;
/**
 * @beta
 */
export type ContributorOptions = {
    lifecycle?: boolean;
    parameters?: boolean;
};
declare class NavigationContributorDirective implements ViewBehaviorFactory {
    readonly options: Required<ContributorOptions>;
    targetNodeId: string;
    constructor(options: Required<ContributorOptions>);
    createHTML(add: AddViewBehaviorFactory): string;
    createBehavior(): NavigationContributorBehavior;
}
declare class NavigationContributorBehavior implements ViewBehavior {
    private directive;
    private router;
    private contributor;
    constructor(directive: NavigationContributorDirective);
    bind(controller: ViewController): void;
    unbind(source: unknown): void;
}
/**
 * @beta
 */
export declare function navigationContributor(options?: ContributorOptions): NavigationContributorDirective;
export {};
