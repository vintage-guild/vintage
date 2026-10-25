import { getCommandMetadata } from "../command/command.js";
/**
 * Maps attribute mode to PropertyType.
 * @param mode - The attribute mode ('boolean', 'reflect', 'fromView').
 * @returns The corresponding PropertyType.
 */
function modeToPropertyType(mode) {
    switch (mode) {
        case "boolean":
            return "boolean";
        default:
            return "string";
    }
}
/**
 * Extracts property schemas from a FASTElementDefinition's attributes.
 * @param definition - The FASTElementDefinition to extract properties from.
 * @returns An array of PropertySchema objects.
 */
export function extractProperties(definition) {
    const properties = [];
    const attributes = definition.attributes;
    for (const attr of attributes) {
        const property = {
            name: attr.name,
            type: modeToPropertyType(attr.mode),
            attribute: attr.attribute,
        };
        properties.push(property);
    }
    return properties;
}
/**
 * Extracts slot schemas from a template.
 * Returns empty array in SSR environments where document is undefined.
 * @param template - The ElementViewTemplate to extract slots from.
 * @returns An array of SlotSchema objects.
 */
export function extractSlots(template) {
    var _a, _b;
    // Guard: Return empty array in SSR environment
    if (typeof document === "undefined" || !template) {
        return [];
    }
    const slots = [];
    try {
        // Create a temporary host element to extract template content
        const tempHost = document.createElement("div");
        const view = template.create(tempHost);
        view.appendTo(tempHost);
        for (const slotElement of Array.from(tempHost.querySelectorAll("slot"))) {
            const name = (_a = slotElement.getAttribute("name")) !== null && _a !== void 0 ? _a : "";
            const description = (_b = slotElement.getAttribute("data-description")) !== null && _b !== void 0 ? _b : undefined;
            slots.push({
                name,
                description,
            });
        }
        view.dispose();
    }
    catch (_c) {
        // If template extraction fails, return empty array
        return [];
    }
    return slots;
}
/**
 * Regex pattern to match CSS custom properties.
 * Matches: --property-name: value;
 */
const cssPropertyRegex = /(--[\w-]+):\s*([^;]+)/g;
/**
 * Extracts CSS custom property schemas from styles.
 * Uses naive regex extraction (v1); will upgrade to CSSTree in v2.
 * @param styles - The ElementStyles to extract CSS properties from.
 * @returns An array of CSSPropertySchema objects.
 */
export function extractCSSProperties(styles) {
    if (!styles) {
        return [];
    }
    const cssProperties = [];
    const seenProperties = new Set();
    for (const style of styles.styles) {
        let cssText;
        if (typeof style === "string") {
            cssText = style;
        }
        else if (typeof CSSStyleSheet !== "undefined" &&
            style instanceof CSSStyleSheet) {
            // Extract text from CSSStyleSheet rules
            try {
                const rules = style.cssRules;
                const textParts = [];
                for (let i = 0; i < rules.length; i++) {
                    textParts.push(rules[i].cssText);
                }
                cssText = textParts.join("\n");
            }
            catch (_a) {
                // CSSStyleSheet may not be accessible in some environments
                continue;
            }
        }
        if (cssText) {
            let match;
            // Reset regex lastIndex for each new string
            cssPropertyRegex.lastIndex = 0;
            while ((match = cssPropertyRegex.exec(cssText)) !== null) {
                const name = match[1];
                const defaultValue = match[2].trim();
                // Avoid duplicates
                if (!seenProperties.has(name)) {
                    seenProperties.add(name);
                    cssProperties.push({
                        name,
                        default: defaultValue,
                    });
                }
            }
        }
    }
    return cssProperties;
}
/**
 * Extracts command schemas from a component class via `command` metadata.
 * @param type - The class constructor to extract commands from.
 * @returns An array of CommandSchema objects.
 */
export function extractCommands(type) {
    const metadata = getCommandMetadata(type);
    return metadata.map(meta => ({
        id: meta.id,
        methodName: meta.methodName,
        label: meta.label,
        icon: meta.icon,
        description: meta.description,
        category: meta.category,
        keybinding: meta.keybinding,
        parameters: meta.parameters,
        when: meta.when,
        hidden: meta.hidden,
    }));
}
/**
 * Builds a complete ComponentSchema from a FASTElementDefinition.
 * Combines property, slot, CSS property, and command extraction.
 * @param definition - The FASTElementDefinition to build a schema from.
 * @param type - The class constructor for the component.
 * @returns A complete ComponentSchema object.
 */
export function buildSchema(definition, type) {
    const properties = extractProperties(definition);
    const slots = extractSlots(definition.template);
    const cssProperties = extractCSSProperties(definition.styles);
    const commands = extractCommands(type);
    return {
        name: definition.name,
        version: undefined, // Phase 2: Extract from decorator or package.json
        description: undefined, // Phase 2: Extract from JSDoc
        properties,
        events: [], // Phase 2: Extract from JSDoc or decorator
        slots,
        cssProperties,
        commands,
    };
}
