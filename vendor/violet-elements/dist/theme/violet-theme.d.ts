import { FASTElement } from "@lushly-dev/fast-element";
import { type VioletThemePreset } from "./generated/violet-theme.generated";
/**
 * Violet optional scoped theme host.
 *
 * @summary Applies the shared Violet runtime token layer to a subtree without requiring a global provider wrapper.
 * @slot - Descendant content that should inherit Violet token values from this scope.
 */
export declare class VioletTheme extends FASTElement {
    /**
     * Selects which Violet runtime theme preset this scoped host should expose.
     */
    preset: VioletThemePreset;
    connectedCallback(): void;
    presetChanged(): void;
}