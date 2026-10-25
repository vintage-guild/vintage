import { Constructable } from "@lushly-dev/fast-element";
import { NavigationQueue } from "./navigation.js";
import { Layout, Transition } from "./view.js";
import { RouteCollection, RouteMatch } from "./routes.js";
import { LinkHandler } from "./links.js";
import { NavigationProcess } from "./process.js";
import { TitleBuilder } from "./titles.js";
import { RoutingEventSink } from "./events.js";
import { NavigationContributor } from "./contributors.js";
import { NavigationPhaseHook, NavigationPhaseName } from "./phases.js";
import { RouteRecognizer } from "./recognizer.js";
/**
 * @beta
 */
export declare abstract class RouterConfiguration<TSettings = any> {
    private isConfigured;
    readonly routes: RouteCollection<TSettings>;
    readonly contributors: NavigationContributor<TSettings>[];
    defaultLayout: Layout;
    defaultTransition: Readonly<Transition>;
    title: string;
    parent: RouterConfiguration<TSettings> | null;
    createNavigationQueue(): NavigationQueue;
    createLinkHandler(): LinkHandler;
    createNavigationProcess(): NavigationProcess;
    createEventSink(): RoutingEventSink;
    createTitleBuilder(): TitleBuilder;
    createRouteRecognizer(): RouteRecognizer<TSettings>;
    construct<T>(Type: Constructable<T>): T;
    recognizeRoute(path: string): Promise<RouteMatch<TSettings> | null>;
    /**
     * Generate a path and query string from a route name and params object.
     *
     * @param name - The name of the route to generate from.
     * @param params - The route params to use when populating the pattern.
     * Properties not required by the pattern will be appended to the query string.
     * @returns The generated absolute path and query string.
     */
    generateRouteFromName(name: string, params: object): Promise<string | null>;
    /**
     * Generate a path and query string from a route path and params object.
     *
     * @param path - The path of the route to generate from.
     * @param params - The route params to use when populating the pattern.
     * Properties not required by the pattern will be appended to the query string.
     * @returns The generated absolute path and query string.
     */
    generateRouteFromPath(path: string, params: object): Promise<string | null>;
    findContributors<T extends NavigationPhaseName>(phase: T): Record<T, NavigationPhaseHook<TSettings>>[];
    protected abstract configure(): Promise<void> | void;
    protected cached(ElementType: new () => HTMLElement): () => Promise<HTMLElement>;
    private ensureConfigured;
}
