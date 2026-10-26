import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet accordion item.
 *
 * @summary Expandable accordion section with a slotted heading button and panel body.
 * @fires toggle-request - Emitted when the heading button requests a change to the expanded state.
 * @slot heading - Heading content rendered inside the accordion trigger button.
 * @slot - Panel body content.
 * @csspart item - Outer item surface.
 * @csspart heading - Heading wrapper with heading semantics.
 * @csspart trigger - Interactive heading button.
 * @csspart heading-content - Wrapper around the heading slot.
 * @csspart indicator - Chevron indicator.
 * @csspart panel - Expandable panel region.
 * @csspart panel-content - Inner panel body wrapper.
 */
export declare class VioletAccordionItem extends FASTElement {
    expanded: boolean;
    disabled: boolean;
    headingLevel: number;
    readonly panelId: string;
    readonly buttonId: string;
    constructor();
    focusTrigger(): void;
    handleTriggerClick(): void;
    private get triggerElement();
}