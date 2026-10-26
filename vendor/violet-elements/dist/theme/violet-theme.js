var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html } from "@lushly-dev/fast-element";
import { VIOLET_THEME_DEFAULT_PRESET, applyVioletThemePreset, applyVioletThemeRoot, installVioletTheme, normalizeVioletThemePreset, } from "./generated/violet-theme.generated";
const styles = css `
    :host {
        display: contents;
    }
`;
const template = html `
    <slot></slot>
`;
/**
 * Violet optional scoped theme host.
 *
 * @summary Applies the shared Violet runtime token layer to a subtree without requiring a global provider wrapper.
 * @slot - Descendant content that should inherit Violet token values from this scope.
 */
export class VioletTheme extends FASTElement {
    connectedCallback() {
        super.connectedCallback();
        const rootNode = this.getRootNode();
        installVioletTheme(rootNode instanceof ShadowRoot ? rootNode : this.ownerDocument);
        applyVioletThemeRoot(this, normalizeVioletThemePreset(this.getAttribute("preset") ?? this.preset ?? VIOLET_THEME_DEFAULT_PRESET));
    }
    presetChanged() {
        if (!this.$fastController.isConnected) {
            return;
        }
        applyVioletThemePreset(this, normalizeVioletThemePreset(this.getAttribute("preset") ?? this.preset ?? VIOLET_THEME_DEFAULT_PRESET));
    }
}
__decorate([
    attr
], VioletTheme.prototype, "preset", void 0);
if (!customElements.get("violet-theme")) {
    await FASTElement.define(VioletTheme, {
        name: "violet-theme",
        template,
        styles,
    });
}