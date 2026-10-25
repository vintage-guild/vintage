import { FASTElement } from "@lushly-dev/fast-element";
import "../color-swatch/violet-color-swatch";
import "../icon/violet-icon";
export type VioletColorPickerSize = "compact" | "natural" | "comfortable";
/**
 * Violet color picker built from a swatch trigger, textual value, and standard channel controls.
 *
 * @summary Token-driven color picker with a popover editor, hex value entry, and HSL channel sliders.
 * @fires input - Emitted when the selected color changes.
 * @fires change - Emitted when the selected color is committed.
 * @slot presets - Optional additional preset content rendered under the built-in swatches.
 */
export declare class VioletColorPicker extends FASTElement {
    #private;
    static readonly formAssociated = true;
    readonly labelId: string;
    readonly triggerId: string;
    readonly valueId: string;
    readonly panelId: string;
    readonly supportingId: string;
    readonly errorId: string;
    readonly hexInputId: string;
    readonly hexHintId: string;
    readonly hueInputId: string;
    readonly saturationInputId: string;
    readonly lightnessInputId: string;
    open: boolean;
    hue: number;
    saturation: number;
    lightness: number;
    hexDraft: string;
    validationInvalid: boolean;
    label: string;
    value: string;
    name: string;
    supportingText: string;
    errorText: string;
    disabled: boolean;
    required: boolean;
    invalid: boolean;
    size: VioletColorPickerSize;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    valueChanged(): void;
    disabledChanged(): void;
    requiredChanged(): void;
    invalidChanged(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    get presets(): string[];
    get currentDisplayColor(): string;
    get currentSelectedColor(): string;
    get describedBy(): string;
    get labelledBy(): string;
    get panelLabel(): string;
    get panelTitleText(): string;
    get controlShellClass(): string;
    get panelClass(): string;
    get expandedText(): string;
    get ariaInvalidText(): string;
    get isInvalid(): boolean;
    get swatchSize(): "compact" | "natural" | "comfortable";
    get triggerValueClass(): string;
    get triggerValueText(): string;
    get triggerMetaText(): string;
    get saturationTrackStyle(): string;
    get lightnessTrackStyle(): string;
    toggleOpen(): void;
    close(): void;
    handleToggle(event: ToggleEvent): void;
    handleHexInput(event: Event): void;
    handleInput(event: Event): void;
    handleHexCommit(event: Event): void;
    handleCommit(event: Event): void;
    handleChannelInput(channel: "h" | "s" | "l", event: Event): void;
    handleChannelCommit(channel: "h" | "s" | "l", event: Event): void;
    handleHueInput(event: Event): void;
    handleHueCommit(event: Event): void;
    handleSaturationInput(event: Event): void;
    handleSaturationCommit(event: Event): void;
    handleLightnessInput(event: Event): void;
    handleLightnessCommit(event: Event): void;
    applyPreset(color: string): void;
    presetAriaLabel(color: string): string;
    formResetCallback(): void;
    formDisabledCallback(disabled: boolean): void;
    checkValidity(): boolean;
    reportValidity(): boolean;
    private get panelElement();
    private get controlShellElement();
    private get hexInputElement();
    private syncFromColor;
    private updateChannel;
    private commitFromChannels;
    private applyColor;
    private syncHexInputValue;
    private syncOpenState;
    private positionPanel;
}