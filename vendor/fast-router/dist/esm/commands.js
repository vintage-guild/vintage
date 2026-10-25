import { __awaiter } from "tslib";
import { FASTElementDefinition, html, HTMLView, ViewTemplate, } from "@lushly-dev/fast-element";
import { FASTElementLayout } from "./view.js";
import { Route } from "./navigation.js";
import { navigationContributor } from "./contributors.js";
/**
 * @beta
 */
export class Ignore {
    createContributor() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                navigate(phase) {
                    return __awaiter(this, void 0, void 0, function* () {
                        phase.cancel();
                    });
                },
            };
        });
    }
}
/**
 * @beta
 */
export class Redirect {
    constructor(redirect) {
        this.redirect = redirect;
    }
    createContributor() {
        return __awaiter(this, void 0, void 0, function* () {
            const redirect = this.redirect;
            return {
                navigate(phase) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const config = phase.router.config;
                        const path = (yield config.generateRouteFromName(redirect, phase.route.allParams)) ||
                            (yield config.generateRouteFromPath(redirect, phase.route.allParams));
                        if (path === null) {
                            throw new Error(`Invalid redirect. Name or path not found: ${redirect}`);
                        }
                        phase.cancel(() => __awaiter(this, void 0, void 0, function* () { return Route.path.replace(path); }));
                    });
                },
            };
        });
    }
}
function factoryFromElementName(tagName) {
    const tag = html.partial(tagName);
    return html `<${tag} ${navigationContributor()}></${tag}>`;
}
function factoryFromElementInstance(element) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(element);
    const factory = navigationContributor();
    factory.targetNodeId = "h";
    const view = new HTMLView(fragment, [factory], {
        [factory.targetNodeId]: element,
    });
    return {
        create() {
            return view;
        },
    };
}
function factoryFromElementDefinition(definition) {
    return __awaiter(this, void 0, void 0, function* () {
        // FAST Element v3 definition is asynchronous. Constructing from parsed
        // markup before platform registration settles can create an unupgraded
        // HTMLElement whose route parameters are then overwritten on upgrade.
        yield definition.registry.whenDefined(definition.name);
        return factoryFromElementInstance(new definition.type());
    });
}
class RenderContributor {
    constructor(router, route, command) {
        this.router = router;
        this.route = route;
        this.command = command;
    }
    construct(phase) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.router.shouldRender(this.route)) {
                phase.cancel();
                return;
            }
            this.operation = yield this.router.beginRender(this.route, this.command);
            phase.onCancel(() => this.operation.rollback());
        });
    }
    commit(phase) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.operation.commit();
            if (this.command.title) {
                phase.setTitle(this.command.title);
            }
        });
    }
}
/**
 * @beta
 */
export class Render {
    constructor(owner, createView) {
        this.owner = owner;
        this.createView = createView;
        this._layout = null;
        this._transition = null;
        this.title = "";
    }
    get transition() {
        return this._transition || this.owner.defaultTransition;
    }
    set transition(value) {
        this._transition = value;
    }
    get layout() {
        return this._layout || this.owner.defaultLayout;
    }
    set layout(value) {
        this._layout = value;
    }
    createContributor(router, route) {
        return __awaiter(this, void 0, void 0, function* () {
            return new RenderContributor(router, route, this);
        });
    }
    static fromDefinition(owner, definition) {
        let createView;
        if ("template" in definition) {
            createView = () => __awaiter(this, void 0, void 0, function* () {
                let template = definition.template;
                if (typeof template === "function") {
                    template = yield template();
                }
                return template.create();
            });
        }
        else {
            createView = () => __awaiter(this, void 0, void 0, function* () {
                let element = definition.element;
                let factory = null;
                if (definition.factory) {
                    factory = definition.factory;
                }
                else if (typeof element === "function") {
                    // Do not cache it becase the function could return
                    // a different value each time.
                    let def = FASTElementDefinition.getByType(element);
                    if (def) {
                        factory = yield factoryFromElementDefinition(def);
                    }
                    else {
                        element = yield element();
                        if (typeof element === "string") {
                            factory = factoryFromElementName(element);
                        }
                        else if (element instanceof HTMLElement) {
                            factory = factoryFromElementInstance(element);
                        }
                        else {
                            def = FASTElementDefinition.getByType(element);
                            if (def) {
                                factory = yield factoryFromElementDefinition(def);
                            }
                            else {
                                throw new Error("Invalid value for element in route config.");
                            }
                        }
                    }
                }
                else if (element instanceof HTMLElement) {
                    definition.factory = factory =
                        factoryFromElementInstance(element);
                }
                else {
                    definition.factory = factory =
                        factoryFromElementName(element);
                }
                return factory.create();
            });
        }
        const command = new Render(owner, createView);
        if (definition.layout) {
            if (definition.layout instanceof ViewTemplate) {
                command.layout = new FASTElementLayout(definition.layout);
            }
            else {
                command.layout = definition.layout;
            }
        }
        if (definition.transition) {
            command.transition = definition.transition;
        }
        if (definition.title) {
            command.title = definition.title;
        }
        return command;
    }
}
