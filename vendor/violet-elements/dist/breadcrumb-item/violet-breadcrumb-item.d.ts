import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet breadcrumb item.
 *
 * @summary Link-or-current breadcrumb item for use inside `violet-breadcrumb`.
 * @slot - Item label content.
 * @slot separator - Optional custom separator glyph.
 * @csspart link - Linked breadcrumb label.
 * @csspart label - Non-linked breadcrumb label.
 * @csspart current - Current page label.
 * @csspart separator - Separator glyph wrapper.
 */
export declare class VioletBreadcrumbItem extends FASTElement {
    #private;
    href: string;
    current: boolean;
    constructor();
    connectedCallback(): void;
    currentChanged(): void;
}