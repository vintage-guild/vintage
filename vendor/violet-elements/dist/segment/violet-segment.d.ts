import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet segmented-control item.
 *
 * @summary Button-like single-selection segment used within `violet-segmented-control`.
 * @fires select-request - Emitted when the segment requests selection.
 * @slot - Visible segment label content.
 * @csspart button - Interactive segment button surface.
 */
export declare class VioletSegment extends FASTElement {
    #private;
    checked: boolean;
    disabled: boolean;
    value: string;
    constructor();
    get effectiveDisabled(): boolean;
    setCheckedFromGroup(checked: boolean): void;
    setGroupDisabled(disabled: boolean): void;
    focusButton(): void;
    handleClick(): void;
    private get buttonElement();
}