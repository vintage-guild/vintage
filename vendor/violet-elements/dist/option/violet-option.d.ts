import { FASTElement } from "@lushly-dev/fast-element";
export declare class VioletOption extends FASTElement {
    #private;
    active: boolean;
    hasDescription: boolean;
    groupDisabled: boolean;
    value: string;
    label: string;
    selected: boolean;
    disabled: boolean;
    readonly optionId: string;
    constructor();
    connectedCallback(): void;
    selectedChanged(): void;
    disabledChanged(): void;
    groupDisabledChanged(): void;
    labelChanged(): void;
    handleDescriptionSlotChange(): void;
    handleClick(event: Event): void;
    get labelText(): string;
    get isDisabled(): boolean;
}