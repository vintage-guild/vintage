import { __awaiter } from "tslib";
import { isNavigationPhaseContributor } from "./contributors.js";
class NavigationPhaseImpl {
    get route() {
        return this.routes[this.routes.length - 1];
    }
    get router() {
        return this.routers[this.routers.length - 1];
    }
    constructor(name, route, router, commitActions, cancelActions) {
        this.name = name;
        this.commitActions = commitActions;
        this.cancelActions = cancelActions;
        this.routes = [];
        this.routers = [];
        this.canceled = false;
        this.titles = [];
        this.routes.push(route);
        this.routers.push(router);
    }
    cancel(callback) {
        this.canceled = true;
        if (callback) {
            this.cancelActions.push(callback);
        }
    }
    onCommit(callback) {
        this.commitActions.push(callback);
    }
    onCancel(callback) {
        this.cancelActions.push(callback);
    }
    setTitle(title) {
        const level = this.router.level;
        while (this.titles.length < level + 1) {
            this.titles.push([]);
        }
        this.titles[level].push(title);
    }
    evaluateContributor(contributor_1) {
        return __awaiter(this, arguments, void 0, function* (contributor, route = this.route, router = this.router) {
            if (isNavigationPhaseContributor(contributor, this.name)) {
                this.routes.push(route);
                this.routers.push(router);
                yield contributor[this.name](this);
                this.routes.pop();
                this.routers.pop();
            }
        });
    }
}
/**
 * @beta
 */
export class DefaultNavigationProcess {
    constructor() {
        this.phases = [
            "navigate",
            "leave",
            "construct",
            "enter",
            "commit",
        ];
    }
    run(router, message) {
        return __awaiter(this, void 0, void 0, function* () {
            const events = router.config.createEventSink();
            const match = yield router.config.recognizeRoute(message.path);
            if (match === null) {
                events.onUnhandledNavigationMessage(router, message);
                return;
            }
            const route = match.route;
            const command = match.command;
            events.onNavigationBegin(router, route, command);
            const commitActions = [];
            const cancelActions = [];
            let finalActions = commitActions;
            const contributors = [
                yield command.createContributor(router, route),
                router,
                this,
            ];
            for (const phaseName of this.phases) {
                const phase = new NavigationPhaseImpl(phaseName, route, router, commitActions, cancelActions);
                events.onPhaseBegin(phase);
                if (phase.canceled) {
                    finalActions = cancelActions;
                }
                else {
                    for (const contributor of contributors) {
                        yield phase.evaluateContributor(contributor);
                        if (phase.canceled) {
                            finalActions = cancelActions;
                            break;
                        }
                    }
                }
                events.onPhaseEnd(phase);
                if (phase.canceled) {
                    break;
                }
            }
            yield Promise.all(finalActions.map(x => x())).then(() => events.onNavigationEnd(router, route, command));
        });
    }
    commit(phase) {
        const builder = phase.router.config.createTitleBuilder();
        document.title = builder.buildTitle(phase.router.config.title, phase.titles);
    }
}
