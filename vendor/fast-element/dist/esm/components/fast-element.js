import { isFunction } from "../interfaces.js";
import { ElementController } from "./element-controller.js";
import { applyFASTElementExtensions, FASTElementDefinition, resolveFASTElementTemplate, } from "./fast-definitions.js";
/* eslint-disable-next-line @typescript-eslint/explicit-function-return-type */
function createFASTElement(BaseType) {
    const type = class extends BaseType {
        constructor() {
            /* eslint-disable-next-line */
            super();
            ElementController.forCustomElement(this);
        }
        $emit(type, detail, options) {
            return this.$fastController.emit(type, detail, options);
        }
        connectedCallback() {
            this.$fastController.connect();
        }
        disconnectedCallback() {
            this.$fastController.disconnect();
        }
        attributeChangedCallback(name, oldValue, newValue) {
            this.$fastController.onAttributeChangedCallback(name, oldValue, newValue);
        }
    };
    FASTElementDefinition.registerBaseType(type);
    return type;
}
function isPromiseLike(value) {
    return typeof (value === null || value === void 0 ? void 0 : value.then) === "function";
}
function define(type, nameOrDef, extensions) {
    if (Array.isArray(nameOrDef)) {
        extensions = nameOrDef;
        nameOrDef = undefined;
    }
    const composePromise = isFunction(type)
        ? FASTElementDefinition.compose(type, nameOrDef)
        : FASTElementDefinition.compose(this, type);
    return composePromise.then(def => {
        applyFASTElementExtensions(def, def.registry, extensions);
        const template = resolveFASTElementTemplate(def);
        if (isPromiseLike(template)) {
            return template.then(() => def.define().type);
        }
        return def.define().type;
    });
}
function from(BaseType) {
    return createFASTElement(BaseType);
}
/**
 * A minimal base class for FASTElements that also provides
 * static helpers for working with FASTElements.
 * @public
 */
export const FASTElement = Object.assign(createFASTElement(HTMLElement), {
    /**
     * Creates a new FASTElement base class inherited from the
     * provided base type.
     * @param BaseType - The base element type to inherit from.
     */
    from,
    /**
     * Defines a platform custom element based on the provided type and definition.
     * @param type - The custom element type to define.
     * @param nameOrDef - The name of the element to define or a definition object
     * that describes the element to define.
     */
    define,
});
/**
 * Decorator: Defines a platform custom element based on `FASTElement`.
 * @param nameOrDef - The name of the element to define or a definition object
 * that describes the element to define.
 * @public
 */
export function customElement(nameOrDef) {
    /* eslint-disable-next-line @typescript-eslint/explicit-function-return-type */
    return function (type) {
        define(type, nameOrDef);
    };
}
