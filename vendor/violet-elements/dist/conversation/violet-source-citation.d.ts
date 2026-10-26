import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
/**
 * Violet source citation.
 *
 * @summary Inline or footnote-style source reference. Maps to AI SDK
 *          SourceUrlUIPart and SourceDocumentUIPart.
 * @slot - Custom citation content (overrides default rendering).
 * @csspart root - The citation container.
 * @csspart badge - The numbered badge.
 * @csspart link - The clickable link (url type).
 * @csspart icon - The document icon (document type).
 * @csspart title - The document title (document type).
 */
export declare class VioletSourceCitation extends FASTElement {
    type: string;
    href: string;
    sourceTitle: string;
    sourceId: string;
    mediaType: string;
    index: string;
    constructor();
    connectedCallback(): void;
}
export type VioletSourceCitationType = "url" | "document";