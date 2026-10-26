import { noop } from "./interfaces.js";
const debugMessages = Object.create(null);
/**
 * The FAST messaging API for warnings and errors.
 * @public
 */
export const FAST = {
    /**
     * Sends a warning to the developer.
     * @param code - The warning code to send.
     * @param values - Values relevant for the warning message.
     */
    warn(_code, _values) { },
    /**
     * Creates an error from a code.
     * @param code - The error code.
     * @param values - Values relevant for the error message.
     */
    error(code, _values) {
        return new Error(`Error ${code}`);
    },
    /**
     * Adds debug messages for errors and warnings.
     * @param messages - The message dictionary to add.
     */
    addMessages(messages) {
        Object.assign(debugMessages, messages);
    },
};
/**
 * Gets the shared debug message lookup.
 * @internal
 */
export function getDebugMessageLookup() {
    return debugMessages;
}
/**
 * A readonly, empty array.
 * @remarks
 * Typically returned by APIs that return arrays when there are
 * no actual items to return.
 * @public
 */
export const emptyArray = Object.freeze([]);
/**
 * Do not change. Part of shared kernel contract.
 * @internal
 */
export function createTypeRegistry() {
    const typeToDefinition = new Map();
    return Object.freeze({
        register(definition) {
            if (typeToDefinition.has(definition.type)) {
                return false;
            }
            typeToDefinition.set(definition.type, definition);
            return true;
        },
        getByType(key) {
            return typeToDefinition.get(key);
        },
        getForInstance(object) {
            if (object === null || object === void 0) {
                return void 0;
            }
            return typeToDefinition.get(object.constructor);
        },
    });
}
/**
 * Creates a function capable of locating metadata associated with a type.
 * @returns A metadata locator function.
 * @internal
 */
export function createMetadataLocator() {
    const metadataLookup = new WeakMap();
    return function (target) {
        let metadata = metadataLookup.get(target);
        if (metadata === void 0) {
            let currentTarget = Reflect.getPrototypeOf(target);
            while (metadata === void 0 && currentTarget !== null) {
                metadata = metadataLookup.get(currentTarget);
                currentTarget = Reflect.getPrototypeOf(currentTarget);
            }
            metadata = metadata === void 0 ? [] : metadata.slice(0);
            metadataLookup.set(target, metadata);
        }
        return metadata;
    };
}
/**
 * Makes a type noop for JSON serialization.
 * @param type - The type to make noop for JSON serialization.
 * @internal
 */
export function makeSerializationNoop(type) {
    type.prototype.toJSON = noop;
}
