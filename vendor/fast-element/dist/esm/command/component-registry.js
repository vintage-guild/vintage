/**
 * Component introspection commands for FAST elements.
 * Pure runtime introspection - no Creator dependencies.
 *
 * @remarks
 * These commands expose FAST component metadata to AI agents and command palettes.
 * Task 9 will add fast.component.getAPI to this file.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { CommandRegistry } from "./registry.js";
import { success, failure } from "./types.js";
import { createWeakReference } from "./weak-ref.js";
import { getAllSchemas, getSchema } from "../definition-schema/api.js";
/**
 * Register fast.component.* commands with the CommandRegistry.
 * Called during fast-element initialization.
 *
 * @remarks
 * These commands provide runtime introspection of registered FAST elements.
 * They have no dependencies on Creator or design-to-code packages.
 *
 * @public
 */
export function registerComponentCommands() {
    // fast.component.list
    CommandRegistry.register("fast.component.list", {
        id: "fast.component.list",
        label: "List all registered FAST components",
        description: "Returns a list of all FAST elements registered with FASTElementDefinition, " +
            "including their tag names and constructor information.",
        category: "FAST",
        execute: () => __awaiter(this, void 0, void 0, function* () {
            if (typeof customElements === "undefined") {
                return success([]);
            }
            const components = Array.from(getAllSchemas(), ([name]) => {
                var _a;
                const elementClass = customElements.get(name);
                return {
                    name,
                    constructor: (_a = elementClass === null || elementClass === void 0 ? void 0 : elementClass.name) !== null && _a !== void 0 ? _a : "Unknown",
                    isDefined: elementClass !== void 0,
                };
            });
            return success(components);
        }),
        canExecute: true,
        when: true,
        expose: { palette: true, agent: true, mcp: true, cli: true },
        source: typeof document !== "undefined"
            ? createWeakReference(document.body)
            : createWeakReference({}),
    });
    // fast.component.getAPI
    CommandRegistry.register("fast.component.getAPI", {
        id: "fast.component.getAPI",
        label: "Get component API schema",
        description: "Returns the full API schema for a FAST component including properties, events, slots, " +
            "and CSS custom properties. Data is extracted directly from ElementDefinition.",
        category: "FAST",
        execute: (args) => __awaiter(this, void 0, void 0, function* () {
            const { name } = args !== null && args !== void 0 ? args : {};
            if (!name) {
                return failure({
                    code: "INVALID_PARAMETERS",
                    message: "Component name is required",
                    suggestion: "Provide a valid custom element tag name (e.g., 'fast-button')",
                    retryable: false,
                });
            }
            // Try to get the schema for this component
            const schema = getSchema(name);
            if (!schema) {
                return failure({
                    code: "NOT_FOUND",
                    message: `Component '${name}' not found in registry`,
                    suggestion: "Ensure the component is registered and defined. Use fast.component.list to see available components.",
                    retryable: false,
                });
            }
            const apiInfo = {
                name: schema.name,
                properties: schema.properties,
                events: schema.events,
                slots: schema.slots,
                cssProperties: schema.cssProperties,
                commands: schema.commands,
            };
            // confidence: 1.0 because data comes directly from ElementDefinition source
            return success(apiInfo, { confidence: 1.0 });
        }),
        canExecute: true,
        when: true,
        expose: { palette: true, agent: true, mcp: true, cli: true },
        source: typeof document !== "undefined"
            ? createWeakReference(document.body)
            : createWeakReference({}),
    });
}
