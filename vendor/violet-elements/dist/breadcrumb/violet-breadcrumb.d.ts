import { FASTElement } from "@lushly-dev/fast-element";
import "../breadcrumb-item/violet-breadcrumb-item";
import type { VioletBreadcrumbItem } from "../breadcrumb-item/violet-breadcrumb-item";
/**
 * Violet breadcrumb container.
 *
 * @summary Labeled breadcrumb navigation surface that renders slotted `violet-breadcrumb-item` elements.
 * @slot - `violet-breadcrumb-item` elements.
 * @csspart nav - Breadcrumb navigation wrapper.
 * @csspart list - Ordered list wrapper.
 */
export declare class VioletBreadcrumb extends FASTElement {
    #private;
    items: VioletBreadcrumbItem[];
    label: string;
    constructor();
    connectedCallback(): void;
    handleSlotChange(): void;
    labelChanged(): void;
}