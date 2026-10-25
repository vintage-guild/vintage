var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
let violetOptionGroupId = 0;
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: grid;
        gap: var(--_space-stack-2xs);
    }

    .label {
        padding-inline: calc(var(--_space-sm) * 1.5);
        color: var(--_text-secondary);
        font-size: var(--_caption-size);
        font-weight: 600;
        line-height: var(--_caption-line);
        letter-spacing: 0.02em;
    }

    :host([disabled]) .label {
        color: var(--_text-muted);
    }

    .options {
        display: grid;
        gap: 2px;
    }

    ::slotted(violet-option) {
        --violet-option-padding-inline-start: calc(var(--_space-sm) * 3);
    }
`;
const template = html `
    ${when(x => Boolean(x.label), html `
            <div class="label" part="label" id="${x => x.labelId}">${x => x.label}</div>
        `)}
    <div class="options" part="options">
        <slot></slot>
    </div>
`;
export class VioletOptionGroup extends FASTElement {
    #internals;
    constructor() {
        super();
        this.#internals = this.attachInternals();
        this.label = "";
        this.disabled = false;
        violetOptionGroupId += 1;
        this.labelId = `violet-option-group-label-${violetOptionGroupId}`;
    }
    connectedCallback() {
        super.connectedCallback();
        this.#syncAccessibility();
    }
    labelChanged() {
        this.#syncAccessibility();
    }
    disabledChanged() {
        this.$emit("group-state-change", { disabled: this.disabled });
    }
    #syncAccessibility() {
        this.#internals.role = "group";
        this.#internals.ariaLabel = this.label || "";
    }
}
__decorate([
    observable
], VioletOptionGroup.prototype, "labelId", void 0);
attr(VioletOptionGroup.prototype, "label");
attr({ mode: "boolean" })(VioletOptionGroup.prototype, "disabled");
if (!customElements.get("violet-option-group")) {
    await FASTElement.define(VioletOptionGroup, {
        name: "violet-option-group",
        template,
        styles,
    });
}