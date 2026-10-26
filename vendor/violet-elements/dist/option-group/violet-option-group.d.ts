import { FASTElement } from "@lushly-dev/fast-element";
export declare class VioletOptionGroup extends FASTElement {
    #private;
    label: string;
    disabled: boolean;
    labelId: string;
    constructor();
    connectedCallback(): void;
    labelChanged(): void;
    disabledChanged(): void;
}