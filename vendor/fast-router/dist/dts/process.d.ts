import { NavigationMessage } from "./navigation.js";
import { NavigationCommitPhase, NavigationPhaseFollowupAction, NavigationPhaseName } from "./phases.js";
import { RecognizedRoute } from "./recognizer.js";
import { Router } from "./router.js";
declare class NavigationPhaseImpl<TSettings = any> implements NavigationCommitPhase<TSettings> {
    readonly name: NavigationPhaseName;
    private readonly commitActions;
    private readonly cancelActions;
    private routes;
    private routers;
    canceled: boolean;
    titles: Array<Array<string>>;
    get route(): RecognizedRoute<TSettings>;
    get router(): Router;
    constructor(name: NavigationPhaseName, route: RecognizedRoute<TSettings>, router: Router<TSettings>, commitActions: NavigationPhaseFollowupAction[], cancelActions: NavigationPhaseFollowupAction[]);
    cancel(callback?: NavigationPhaseFollowupAction): void;
    onCommit(callback: NavigationPhaseFollowupAction): void;
    onCancel(callback: NavigationPhaseFollowupAction): void;
    setTitle(title: string): void;
    evaluateContributor(contributor: any, route?: RecognizedRoute<TSettings>, router?: Router): Promise<void>;
}
/**
 * @beta
 */
export interface NavigationProcess {
    run(router: Router, message: NavigationMessage): Promise<void>;
}
/**
 * @beta
 */
export declare class DefaultNavigationProcess<TSettings> {
    private phases;
    run(router: Router, message: NavigationMessage): Promise<void>;
    commit(phase: NavigationPhaseImpl): void;
}
export {};
