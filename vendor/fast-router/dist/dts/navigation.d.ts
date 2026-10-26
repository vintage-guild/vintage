import { Router } from "./router.js";
/**
 * @beta
 */
export interface Route {
    readonly path: string;
    readonly name?: string;
    readonly caseSensitive?: boolean;
}
/**
 * @beta
 */
export declare class NavigationMessage {
    path: string;
    constructor(path: string);
}
/**
 * @beta
 */
export interface NavigationHandler {
    enqueue(msg: NavigationMessage): void;
}
/**
 * @beta
 */
export declare const NavigationHandler: Readonly<{
    register(handler: NavigationHandler): void;
    unregister(handler: NavigationHandler): void;
}>;
/**
 * @beta
 */
export interface NavigationQueue {
    connect(): void;
    disconnect(): void;
    receive(): Promise<NavigationMessage>;
}
/**
 * @beta
 */
export declare const Route: Readonly<{
    path: Readonly<{
        readonly current: string;
        generateRoute(relativeTo: HTMLElement | Router, path: string, params?: Object): Promise<string | null>;
        push(path: string, trigger?: boolean): void;
        replace(path: string, trigger?: boolean): void;
        trigger(path: string): void;
    }>;
    name: Readonly<{
        generateRoute(relativeTo: HTMLElement | Router, name: string, params?: Object): Promise<string | null>;
        push(relativeTo: HTMLElement | Router, name: string, params?: Object, trigger?: boolean): Promise<void>;
        replace(relativeTo: HTMLElement | Router, name: string, params?: Object, trigger?: boolean): Promise<void>;
        trigger(relativeTo: HTMLElement | Router, name: string, params?: Object): Promise<void>;
    }>;
}>;
/**
 * @beta
 */
export declare class DefaultNavigationQueue implements NavigationQueue, NavigationHandler {
    private queue;
    private promise;
    private resolve;
    connect(): void;
    disconnect(): void;
    receive(): Promise<NavigationMessage>;
    enqueue(msg: NavigationMessage): void;
    private tryDequeue;
    handleEvent(event: PopStateEvent): void;
}
