import { Constructable, FASTElement, ViewTemplate } from "@lushly-dev/fast-element";
import { RecognizedRoute, RouteParameterConverter } from "./recognizer.js";
import { NavigationCommand } from "./commands.js";
import { Layout, Transition } from "./view.js";
import { RouterConfiguration } from "./configuration.js";
import { Route } from "./navigation.js";
/**
 * @internal
 */
export declare const childRouteParameter = "fast-child-route";
/**
 * @beta
 */
export type SupportsSettings<TSettings = any> = {
    settings?: TSettings;
};
/**
 * @beta
 */
export type PathedRouteDefinition<TSettings = any> = SupportsSettings<TSettings> & Route;
/**
 * @beta
 */
export type IgnorableRouteDefinition<TSettings = any> = PathedRouteDefinition<TSettings>;
/**
 * @beta
 */
export type LayoutAndTransitionRouteDefinition = {
    layout?: Layout | ViewTemplate;
    transition?: Transition;
};
/**
 * @beta
 */
export type RedirectRouteDefinition<TSettings = any> = PathedRouteDefinition<TSettings> & {
    redirect: string;
};
/**
 * @beta
 */
export type HasTitle = {
    title?: string;
};
/**
 * @beta
 */
export type NavigableRouteDefinition<TSettings = any> = PathedRouteDefinition<TSettings> & LayoutAndTransitionRouteDefinition & HasTitle & {
    childRouters?: boolean;
};
/**
 * @beta
 */
export type FASTElementConstructor = new () => FASTElement;
/**
 * @beta
 */
export type HasElement = {
    element: string | FASTElementConstructor | HTMLElement | (() => Promise<string | FASTElementConstructor | HTMLElement>);
};
/**
 * @beta
 */
export type ElementFallbackRouteDefinition<TSettings = any> = LayoutAndTransitionRouteDefinition & HasElement & SupportsSettings<TSettings> & HasTitle;
/**
 * @beta
 */
export type ElementRouteDefinition<TSettings = any> = NavigableRouteDefinition<TSettings> & HasElement;
/**
 * @beta
 */
export type HasTemplate = {
    template: ViewTemplate | (() => Promise<ViewTemplate>);
};
/**
 * @beta
 */
export type TemplateFallbackRouteDefinition<TSettings = any> = LayoutAndTransitionRouteDefinition & HasTemplate & SupportsSettings<TSettings> & HasTitle;
/**
 * @beta
 */
export type TemplateRouteDefinition<TSettings = any> = NavigableRouteDefinition<TSettings> & HasTemplate;
/**
 * @beta
 */
export type HasCommand = {
    command: NavigationCommand;
};
/**
 * @beta
 */
export type CommandRouteDefinition<TSettings = any> = PathedRouteDefinition<TSettings> & HasCommand & HasTitle;
/**
 * @beta
 */
export type CommandFallbackRouteDefinition<TSettings = any> = HasCommand & SupportsSettings<TSettings> & HasTitle;
/**
 * @beta
 */
export type FallbackRouteDefinition<TSettings = any> = ElementFallbackRouteDefinition<TSettings> | TemplateFallbackRouteDefinition<TSettings> | Pick<RedirectRouteDefinition<TSettings>, "redirect"> | CommandFallbackRouteDefinition<TSettings>;
/**
 * @beta
 */
export type DefinitionCallback = () => Promise<FallbackRouteDefinition> | FallbackRouteDefinition;
/**
 * @beta
 */
export type RenderableRouteDefinition<TSettings = any> = ElementRouteDefinition<TSettings> | TemplateRouteDefinition<TSettings>;
/**
 * @beta
 */
export type MappableRouteDefinition<TSettings = any> = RenderableRouteDefinition<TSettings> | RedirectRouteDefinition<TSettings> | CommandRouteDefinition<TSettings> | ParentRouteDefinition<TSettings>;
/**
 * @beta
 */
export type ParentRouteDefinition<TSettings = any> = PathedRouteDefinition<TSettings> & LayoutAndTransitionRouteDefinition & {
    children: MappableRouteDefinition<TSettings>[];
};
/**
 * @beta
 */
export type RouteMatch<TSettings = any> = {
    route: RecognizedRoute<TSettings>;
    command: NavigationCommand;
};
/**
 * @beta
 */
export type RouteParameterConverterObject = {
    convert: RouteParameterConverter;
};
/**
 * @beta
 */
export type ParameterConverter = RouteParameterConverter | RouteParameterConverterObject | Constructable<RouteParameterConverterObject>;
/**
 * @beta
 */
export declare class RouteCollection<TSettings = any> {
    private owner;
    private _recognizer;
    private pathToCommand;
    private fallbackCommand;
    private fallbackSettings;
    private converters;
    constructor(owner: RouterConfiguration);
    private get recognizer();
    ignore(definitionOrString: IgnorableRouteDefinition<TSettings> | string): void;
    map(...routes: MappableRouteDefinition<TSettings>[]): void;
    fallback(definitionOrCallback: FallbackRouteDefinition<TSettings> | DefinitionCallback): void;
    converter(name: string, converter: ParameterConverter): void;
    recognize(path: string): Promise<RouteMatch<TSettings> | null>;
    /**
     * Generate a path and query string from a route name and params object.
     *
     * @param name - The name of the route to generate from.
     * @param params - The route params to use when populating the pattern.
     * Properties not required by the pattern will be appended to the query string.
     * @returns The generated absolute path and query string.
     */
    generateFromName(name: string, params: object): string | null;
    /**
     * Generate a path and query string from a route path and params object.
     *
     * @param path - The path of the route to generate from.
     * @param params - The route params to use when populating the pattern.
     * Properties not required by the pattern will be appended to the query string.
     * @returns The generated absolute path and query string.
     */
    generateFromPath(path: string, params: object): string | null;
    private aggregateConverters;
}
