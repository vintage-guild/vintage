import registryText from "../../tokens/master-semantic.tokens.jsonc?raw";
function parseJsonc(text) {
    const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutLineComments = withoutBlockComments.replace(/(^|[^:\\])\/\/.*$/gm, "$1");
    const withoutTrailingCommas = withoutLineComments.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(withoutTrailingCommas);
}
function titleCase(segment) {
    return segment
        .split(/[-.]/g)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function groupIdForToken(token) {
    const [, family = token.metadata.category] = token.id.split(".");
    if (token.id.startsWith("size.space.")) {
        return "spacing-scale";
    }
    if (token.id.startsWith("size.target.")) {
        return "target-scale";
    }
    if (token.id.startsWith("size.font.")) {
        return "type-scale";
    }
    if (token.id.startsWith("size.line.")) {
        return "line-scale";
    }
    if (token.id.startsWith("weight.")) {
        return "font-weight";
    }
    if (token.id.startsWith("color.surface.")) {
        return "surface";
    }
    if (token.id.startsWith("color.text.")) {
        return "text";
    }
    if (token.id.startsWith("color.border.") || token.id.startsWith("color.focus.")) {
        return "structure";
    }
    if (token.id.startsWith("space.")) {
        return "spacing";
    }
    if (token.id.startsWith("type.")) {
        return "typography";
    }
    if (token.id.startsWith("radius.")) {
        return "shape";
    }
    if (token.id.startsWith("shadow.")) {
        return "elevation";
    }
    if (token.id.startsWith("duration.") || token.id.startsWith("easing.")) {
        return "motion";
    }
    return family;
}
const groupDescriptions = new Map([
    ["spacing-scale", "Base spacing ramp values that semantic spacing tokens reference."],
    ["target-scale", "Base control target sizes used for adaptive density across fine and coarse input modes."],
    ["type-scale", "Base font-size ramp values that semantic text styles reference."],
    ["line-scale", "Base line-height ramp values that semantic text styles reference."],
    ["font-weight", "Base weight values that semantic text styles reference."],
    ["surface", "Canvas and container surfaces that define depth and hierarchy."],
    ["text", "Readable foreground values for content, metadata, and lower-emphasis copy."],
    ["structure", "Borders and focus treatments that establish separation and keyboard visibility."],
    ["spacing", "Directional spacing rhythm for inline gaps and stacked layout."],
    ["typography", "Semantic text styles for captions, labels, body copy, and titles."],
    ["shape", "Corner and silhouette values that define the system’s geometry."],
    ["elevation", "Shadow values used when layers need to rise above the surrounding surface."],
    ["motion", "Durations and easing curves that keep interface motion coherent and calm."],
]);
export const violetTokenRegistry = parseJsonc(registryText);
export const violetTokenGroups = Array.from(violetTokenRegistry.tokens.reduce((map, token) => {
    const groupId = groupIdForToken(token);
    const existing = map.get(groupId) ?? {
        id: groupId,
        title: titleCase(groupId),
        description: groupDescriptions.get(groupId) ??
            "Foundational tokens in this family share a common design role.",
        tokens: [],
    };
    existing.tokens.push(token);
    map.set(groupId, existing);
    return map;
}, new Map())).map(([, group]) => group);
export function tokenIdToCssVar(tokenId) {
    return `--${tokenId.replace(/\./g, "-")}`;
}
function isTokenReferenceValue(value) {
    return typeof value === "object" && value !== null && "ref" in value;
}
export function tokenValueToCssValue(value) {
    if (isTokenReferenceValue(value)) {
        return `var(${tokenIdToCssVar(value.ref)})`;
    }
    return String(value);
}
export function buildRegistryCssVars(tokens) {
    return tokens.map(token => `${tokenIdToCssVar(token.id)}: ${tokenValueToCssValue(token.value)};`).join("\n");
}
export function isColorToken(token) {
    return token.metadata.category === "color";
}