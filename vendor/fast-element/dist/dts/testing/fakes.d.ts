import { ExecutionContext } from "../observation/observable.js";
import type { ViewBehavior, ViewBehaviorTargets } from "../templating/html-directive.js";
export declare const Fake: Readonly<{
    executionContext<TParent = any>(parent?: TParent, parentContext?: ExecutionContext<TParent>): ExecutionContext<TParent>;
    viewController<TSource = any, TParent = any>(targets?: ViewBehaviorTargets, ...behaviors: ViewBehavior<TSource, TParent>[]): {
        isBound: boolean;
        context: ExecutionContext<TParent>;
        onUnbind(object: any): void;
        source: TSource;
        targets: ViewBehaviorTargets;
        toJSON: () => undefined;
        bind(source: TSource, context?: ExecutionContext<TParent>): void;
        unbind(): void;
    };
}>;
