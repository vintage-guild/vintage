import type { FASTElementDefinition } from "../components/fast-definitions.js";
import type { ElementStyles } from "../styles/element-styles.js";
import type { ElementViewTemplate } from "../templating/template.js";
import type { CommandSchema, ComponentSchema, CSSPropertySchema, PropertySchema, SlotSchema } from "./types.js";
/**
 * Extracts property schemas from a FASTElementDefinition's attributes.
 * @param definition - The FASTElementDefinition to extract properties from.
 * @returns An array of PropertySchema objects.
 */
export declare function extractProperties(definition: FASTElementDefinition): PropertySchema[];
/**
 * Extracts slot schemas from a template.
 * Returns empty array in SSR environments where document is undefined.
 * @param template - The ElementViewTemplate to extract slots from.
 * @returns An array of SlotSchema objects.
 */
export declare function extractSlots(template: ElementViewTemplate | undefined): SlotSchema[];
/**
 * Extracts CSS custom property schemas from styles.
 * Uses naive regex extraction (v1); will upgrade to CSSTree in v2.
 * @param styles - The ElementStyles to extract CSS properties from.
 * @returns An array of CSSPropertySchema objects.
 */
export declare function extractCSSProperties(styles: ElementStyles | undefined): CSSPropertySchema[];
/**
 * Extracts command schemas from a component class via `command` metadata.
 * @param type - The class constructor to extract commands from.
 * @returns An array of CommandSchema objects.
 */
export declare function extractCommands(type: Function): CommandSchema[];
/**
 * Builds a complete ComponentSchema from a FASTElementDefinition.
 * Combines property, slot, CSS property, and command extraction.
 * @param definition - The FASTElementDefinition to build a schema from.
 * @param type - The class constructor for the component.
 * @returns A complete ComponentSchema object.
 */
export declare function buildSchema(definition: FASTElementDefinition, type: Function): ComponentSchema;
