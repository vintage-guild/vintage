import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable icon primitive.
 *
 * @summary Token-driven icon renderer backed by the registered Violet icon registry.
 * @csspart glyph - Inline wrapper containing the rendered SVG.
 */
export declare class VioletIcon extends FASTElement {
    /**
     * Registry name for the icon, using source-prefixed ids such as system/search.
     */
    icon: string;
    /**
     * Optional accessible label when the icon is not decorative.
     */
    label: string;
    /**
     * Marks the icon decorative when it should be hidden from assistive technology.
     */
    decorative: boolean;
    constructor();
}