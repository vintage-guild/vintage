import { HTMLDirective, Markup, } from "@lushly-dev/fast-element";
import { Router } from "./router.js";
/**
 * @beta
 */
export function isNavigationPhaseContributor(object, phase) {
    return phase in object;
}
const defaultOptions = {
    lifecycle: true,
    parameters: true,
};
class NavigationContributorDirective {
    constructor(options) {
        this.options = options;
    }
    createHTML(add) {
        return Markup.attribute(add(this));
    }
    createBehavior() {
        return new NavigationContributorBehavior(this);
    }
}
HTMLDirective.define(NavigationContributorDirective);
class NavigationContributorBehavior {
    constructor(directive) {
        this.directive = directive;
        this.router = null;
    }
    bind(controller) {
        var _a;
        const context = controller.context;
        const options = this.directive.options;
        this.contributor = controller.targets[this.directive.targetNodeId];
        if (options.lifecycle) {
            this.router = (_a = context.router) !== null && _a !== void 0 ? _a : Router.find(this.contributor);
            if (this.router) {
                this.router.addContributor(this.contributor);
                controller.onUnbind(this);
            }
        }
        if (options.parameters) {
            const contributor = this.contributor;
            const routeParams = controller.source;
            for (const key in routeParams) {
                contributor[key] = routeParams[key];
            }
        }
    }
    unbind(source) {
        this.router.removeContributor(this.contributor);
    }
}
/**
 * @beta
 */
export function navigationContributor(options) {
    return new NavigationContributorDirective(Object.assign({}, defaultOptions, options));
}
