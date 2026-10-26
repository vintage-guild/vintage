/**
 * Component introspection commands for FAST elements.
 * Pure runtime introspection - no Creator dependencies.
 *
 * @remarks
 * These commands expose FAST component metadata to AI agents and command palettes.
 * Task 9 will add fast.component.getAPI to this file.
 */
import type { ComponentSchema } from "../definition-schema/types.js";
/**
 * Component list result item.
 * @public
 */
export interface ComponentInfo {
    /** The custom element tag name */
    name: string;
    /** The constructor function name */
    constructor: string;
    /** Whether the element is defined in the platform registry */
    isDefined: boolean;
}
/**
 * Component API result from fast.component.getAPI.
 * @public
 */
export interface ComponentAPIInfo {
    /** The custom element tag name */
    name: string;
    /** Properties exposed by the component */
    properties: ComponentSchema["properties"];
    /** Events emitted by the component */
    events: ComponentSchema["events"];
    /** Slots available in the component */
    slots: ComponentSchema["slots"];
    /** CSS custom properties (design tokens) */
    cssProperties: ComponentSchema["cssProperties"];
    /** Commands exposed by the component */
    commands?: ComponentSchema["commands"];
}
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
export declare function registerComponentCommands(): void;
