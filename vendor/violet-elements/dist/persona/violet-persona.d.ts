import { FASTElement } from "@lushly-dev/fast-element";
export declare class VioletPersona extends FASTElement {
    imageFailed: boolean;
    tone: string;
    label: string;
    src: string;
    initials: string;
    decorative: boolean;
    size: "xs" | "sm" | "md" | "lg" | "xl";
    readonly personaId: string;
    constructor();
    connectedCallback(): void;
    labelChanged(): void;
    initialsChanged(): void;
    srcChanged(): void;
    handleImageError(): void;
    get accessibleLabel(): string;
    get displayInitials(): string;
    private syncTone;
}