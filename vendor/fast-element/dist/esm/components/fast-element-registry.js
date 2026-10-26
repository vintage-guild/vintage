import { Observable } from "../observation/observable.js";
import { createTypeRegistry } from "../platform.js";
const globalRegisteredTypes = {};
const registeredTypesByRegistry = new WeakMap();
const typeRegistry = createTypeRegistry();
/**
 * The FAST custom element registry.
 * @remarks
 * This registry stores FAST element definitions by constructor so consumers can
 * look up the `FASTElementDefinition` associated with an element type, instance,
 * or registered tag name.
 * @public
 */
export const fastElementRegistry = Object.freeze({
    register(definition) {
        if (!typeRegistry.register(definition)) {
            return false;
        }
        const registeredTypes = getRegisteredTypes(definition.registry);
        if (!Object.prototype.hasOwnProperty.call(registeredTypes, definition.name)) {
            Observable.defineProperty(registeredTypes, definition.name);
        }
        registeredTypes[definition.name] = definition.type;
        return true;
    },
    getByType: typeRegistry.getByType,
    getForInstance: typeRegistry.getForInstance,
    whenRegistered,
});
function getRegisteredTypes(registry = customElements) {
    if (registry === customElements) {
        return globalRegisteredTypes;
    }
    let registeredTypes = registeredTypesByRegistry.get(registry);
    if (!registeredTypes) {
        registeredTypes = {};
        registeredTypesByRegistry.set(registry, registeredTypes);
    }
    return registeredTypes;
}
function getDefinitionForType(type) {
    return type === void 0 ? void 0 : fastElementRegistry.getByType(type);
}
function whenRegistered(name, registry = customElements) {
    const registeredTypes = getRegisteredTypes(registry);
    if (!Object.prototype.hasOwnProperty.call(registeredTypes, name)) {
        Observable.defineProperty(registeredTypes, name);
    }
    const definition = getDefinitionForType(registeredTypes[name]);
    if (definition !== void 0) {
        return Promise.resolve(definition);
    }
    return new Promise(resolve => {
        const notifier = Observable.getNotifier(registeredTypes);
        const subscriber = {
            handleChange: () => {
                const definition = getDefinitionForType(registeredTypes[name]);
                if (definition === void 0) {
                    return;
                }
                notifier.unsubscribe(subscriber, name);
                resolve(definition);
            },
        };
        notifier.subscribe(subscriber, name);
    });
}
