var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, Observable, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
let violetPersonaCount = 0;
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: inline-flex;
        --_persona-size: var(--violet-persona-size, 32px);
        --_persona-font-size: var(--violet-persona-font-size, 12px);
        --_persona-border-color: color-mix(in srgb, var(--_border-subtle) 90%, transparent);
        --_persona-shadow: var(--shadow-control, 0 1px 1px rgba(28, 26, 13, 0.09), 0 2px 5px rgba(28, 26, 13, 0.04));
    }

    :host([size="xs"]) {
        --_persona-size: var(--violet-persona-size, 24px);
        --_persona-font-size: var(--violet-persona-font-size, 10px);
    }

    :host([size="sm"]) {
        --_persona-size: var(--violet-persona-size, 32px);
        --_persona-font-size: var(--violet-persona-font-size, 12px);
    }

    :host([size="md"]) {
        --_persona-size: var(--violet-persona-size, 40px);
        --_persona-font-size: var(--violet-persona-font-size, 14px);
    }

    :host([size="lg"]) {
        --_persona-size: var(--violet-persona-size, 48px);
        --_persona-font-size: var(--violet-persona-font-size, 16px);
    }

    :host([size="xl"]) {
        --_persona-size: var(--violet-persona-size, 64px);
        --_persona-font-size: var(--violet-persona-font-size, 20px);
    }

    .root {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: var(--_persona-size);
        block-size: var(--_persona-size);
        overflow: hidden;
        border: 1px solid var(--_persona-border-color);
        border-radius: var(--_radius-round);
        background: var(--_tone-background, var(--_surface-subtle));
        box-shadow: var(--_persona-shadow);
        color: var(--_tone-foreground, var(--_text-primary));
        font-size: var(--_persona-font-size);
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        user-select: none;
        -webkit-user-select: none;
    }

    .root[data-tone="moss"] {
        --_tone-background: color-mix(in srgb, #b9d3b0 48%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .root[data-tone="sky"] {
        --_tone-background: color-mix(in srgb, #b8d2eb 50%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .root[data-tone="amber"] {
        --_tone-background: color-mix(in srgb, #e8d09c 52%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .root[data-tone="terracotta"] {
        --_tone-background: color-mix(in srgb, #e2b29d 54%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .root[data-tone="plum"] {
        --_tone-background: color-mix(in srgb, #cfbddb 54%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .root[data-tone="slate"] {
        --_tone-background: color-mix(in srgb, #c8cfdb 56%, var(--_surface-card));
        --_tone-foreground: var(--_text-primary);
    }

    .image {
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
        display: block;
    }

    .fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 100%;
        block-size: 100%;
    }

    @media (forced-colors: active) {
        .root {
            forced-color-adjust: none;
            background: Canvas;
            color: CanvasText;
            border-color: ButtonText;
            box-shadow: none;
        }
    }
`;
const template = html `
    <div
        class="root"
        part="root"
        data-tone="${x => x.tone}"
        role="${x => (x.decorative ? "presentation" : "img")}"
        aria-hidden="${x => (x.decorative ? "true" : "false")}"
        aria-label="${x => (x.decorative ? null : x.accessibleLabel)}"
    >
        ${when(x => Boolean(x.src), html `
                <img
                    class="image"
                    part="image"
                    src="${x => x.src}"
                    alt=""
                    ?hidden="${x => x.imageFailed}"
                    @error="${x => x.handleImageError()}"
                />
            `)}
        <span class="fallback" part="fallback" aria-hidden="true" ?hidden="${x => Boolean(x.src) && !x.imageFailed}">
            ${x => x.displayInitials}
        </span>
    </div>
`;
export class VioletPersona extends FASTElement {
    constructor() {
        super();
        violetPersonaCount += 1;
        this.personaId = `violet-persona-${violetPersonaCount}`;
        this.label = "";
        this.src = "";
        this.initials = "";
        this.decorative = false;
        this.size = "sm";
        this.imageFailed = false;
        this.tone = "moss";
    }
    connectedCallback() {
        super.connectedCallback();
        this.syncTone();
    }
    labelChanged() {
        this.syncTone();
    }
    initialsChanged() {
        this.syncTone();
    }
    srcChanged() {
        this.imageFailed = false;
    }
    handleImageError() {
        this.imageFailed = true;
    }
    get accessibleLabel() {
        Observable.trackVolatile();
        return this.label || this.displayInitials || "Persona";
    }
    get displayInitials() {
        Observable.trackVolatile();
        if (this.initials.trim()) {
            return this.initials.trim().slice(0, this.size === "xs" ? 1 : 3).toUpperCase();
        }
        const derived = getPersonaInitials(this.label, this.size === "xs");
        return derived || "?";
    }
    syncTone() {
        const source = this.label || this.initials || this.personaId || "";
        const tones = ["moss", "sky", "amber", "terracotta", "plum", "slate"];
        const hash = Array.from(source).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        this.tone = tones[hash % tones.length] ?? "moss";
    }
}
__decorate([
    observable
], VioletPersona.prototype, "imageFailed", void 0);
__decorate([
    observable
], VioletPersona.prototype, "tone", void 0);
function getPersonaInitials(label, firstInitialOnly) {
    const cleaned = label.replace(/\s+/g, " ").trim();
    if (!cleaned) {
        return "";
    }
    const parts = cleaned
        .split(" ")
        .map(part => part.replace(/[^A-Za-z0-9]/g, ""))
        .filter(Boolean);
    if (parts.length === 0) {
        return "";
    }
    if (firstInitialOnly || parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return `${parts[0].charAt(0)}${parts.at(-1)?.charAt(0) ?? ""}`.toUpperCase();
}
attr(VioletPersona.prototype, "label");
attr(VioletPersona.prototype, "src");
attr(VioletPersona.prototype, "initials");
attr({ mode: "boolean" })(VioletPersona.prototype, "decorative");
attr(VioletPersona.prototype, "size");
if (!customElements.get("violet-persona")) {
    await FASTElement.define(VioletPersona, {
        name: "violet-persona",
        template,
        styles,
    });
}