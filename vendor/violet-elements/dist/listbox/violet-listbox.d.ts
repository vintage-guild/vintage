import { FASTElement } from "@lushly-dev/fast-element";
import "../option-group/violet-option-group";
import "../option/violet-option";
import type { VioletOption } from "../option/violet-option";
export declare class VioletListbox extends FASTElement {
    #private;
    activeValue: string;
    label: string;
    value: string;
    disabled: boolean;
    multiple: boolean;
    selectionFollowsFocus: boolean;
    selectedValues: string[];
    readonly listboxId: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get options(): VioletOption[];
    get activeOptionId(): string;
    handleSlotChange(): void;
    handleFocus(): void;
    handleKeydown(event: KeyboardEvent): void;
    handleRequestSelect(event: CustomEvent<{
        value?: string;
    }>): void;
    valueChanged(): void;
    activeValueChanged(): void;
    selectedValuesChanged(): void;
    selectValue(nextValue: string, emit?: boolean): void;
    toggleValue(nextValue: string, emit?: boolean): void;
    toggleAll(): void;
}