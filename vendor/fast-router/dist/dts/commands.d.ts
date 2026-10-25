import { Router } from "./router.js";
import { RouterConfiguration } from "./configuration.js";
import { Layout, RouteView, Transition } from "./view.js";
import { ElementFallbackRouteDefinition, ElementRouteDefinition, TemplateFallbackRouteDefinition, TemplateRouteDefinition } from "./routes.js";
import { RecognizedRoute } from "./recognizer.js";
import { NavigationContributor } from "./contributors.js";
import { NavigationCommitPhase, NavigationPhase } from "./phases.js";
/**
 * @beta
 */
export interface NavigationCommand {
    createContributor(router: Router, route: RecognizedRoute): Promise<NavigationContributor>;
}
/**
 * @beta
 */
export interface RenderCommand extends NavigationCommand {
    layout: Layout;
    transition: Transition;
    createView(): Promise<RouteView>;
}
/**
 * @beta
 */
export declare class Ignore implements NavigationCommand {
    createContributor(): Promise<{
        navigate(phase: NavigationPhase): Promise<void>;
    }>;
}
/**
 * @beta
 */
export declare class Redirect implements NavigationCommand {
    private redirect;
    constructor(redirect: string);
    createContributor(): Promise<{
        navigate(phase: NavigationPhase): Promise<void>;
    }>;
}
declare class RenderContributor {
    private router;
    private route;
    private command;
    private operation;
    constructor(router: Router, route: RecognizedRoute, command: Render);
    construct(phase: NavigationPhase): Promise<void>;
    commit(phase: NavigationCommitPhase): Promise<void>;
}
/**
 * @beta
 */
export declare class Render implements RenderCommand {
    private owner;
    createView: () => Promise<RouteView>;
    private _layout;
    private _transition;
    title: string;
    constructor(owner: RouterConfiguration, createView: () => Promise<RouteView>);
    get transition(): Transition;
    set transition(value: Transition);
    get layout(): Layout;
    set layout(value: Layout);
    createContributor(router: Router, route: RecognizedRoute): Promise<RenderContributor>;
    static fromDefinition(owner: RouterConfiguration, definition: ElementRouteDefinition | TemplateRouteDefinition | ElementFallbackRouteDefinition | TemplateFallbackRouteDefinition): Render;
}
export {};
