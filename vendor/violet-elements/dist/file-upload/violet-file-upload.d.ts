import { FASTElement } from "@lushly-dev/fast-element";
import "../button/violet-button";
import "../icon-button/violet-icon-button";
import "../icon/violet-icon";
export type VioletFileUploadAppearance = "button" | "dropzone";
export type VioletFileUploadSize = "compact" | "natural" | "comfortable";
type VioletFileListItem = {
    readonly file: File;
    readonly index: number;
    readonly key: string;
    readonly meta: string;
};
/**
 * Native-first file selection control with optional dropzone presentation.
 *
 * @summary Form-associated file upload primitive that keeps the native file input as the source of truth while adding Violet trigger, drag-and-drop, selection list, and validation UI.
 * @fires input - Emitted when the selected files change. Detail: `{ files }`.
 * @fires change - Emitted when the selected files are committed. Detail: `{ files }`.
 * @fires remove - Emitted when a selected file is removed. Detail: `{ file, index, files }`.
 * @csspart field - Overall field wrapper.
 * @csspart label - Field label.
 * @csspart native-input - Visually hidden native file input.
 * @csspart surface - Main trigger surface.
 * @csspart browse-button - Primary browse action button.
 * @csspart selection - Selected-file section.
 * @csspart file-list - List of selected files.
 * @csspart file-item - Individual selected-file row.
 * @csspart remove-button - Remove action for a selected file.
 * @csspart supporting-text - Supporting text element.
 * @csspart error-text - Error text element.
 */
export declare class VioletFileUpload extends FASTElement {
    #private;
    static readonly formAssociated = true;
    readonly inputId: string;
    readonly labelId: string;
    readonly supportingId: string;
    readonly errorId: string;
    readonly summaryId: string;
    label: string;
    supportingText: string;
    errorText: string;
    appearance: VioletFileUploadAppearance;
    size: VioletFileUploadSize;
    accept: string;
    name: string;
    disabled: boolean;
    required: boolean;
    invalid: boolean;
    multiple: boolean;
    maxFiles: string;
    maxFileSize: string;
    dragActive: boolean;
    files: File[];
    customValidationMessage: string;
    constructor();
    connectedCallback(): void;
    filesChanged(): void;
    disabledChanged(): void;
    requiredChanged(): void;
    invalidChanged(): void;
    customValidationMessageChanged(): void;
    multipleChanged(): void;
    formResetCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    get value(): string;
    checkValidity(): boolean;
    reportValidity(): boolean;
    setFiles(files: readonly File[]): boolean;
    clearFiles(): void;
    removeFileAt(index: number): void;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    handleBrowseButtonClick(event: Event): void;
    handleSurfaceClick(event: Event): void;
    handleInputChange(event: Event): void;
    handleDragEnter(event: DragEvent): void;
    handleDragOver(event: DragEvent): void;
    handleDragLeave(event: DragEvent): void;
    handleDrop(event: DragEvent): void;
    openPicker(): void;
    get hasFiles(): boolean;
    get fileItems(): VioletFileListItem[];
    get browseButtonLabel(): string;
    get buttonTitle(): string;
    get summaryText(): string;
    get dropzoneTitle(): string;
    get dropzoneMessage(): string;
    get selectionSummaryText(): string;
    get triggerAriaLabel(): string;
    get describedBy(): string | null;
    get errorMessageId(): string | null;
    get effectiveErrorText(): string;
    get showErrorText(): boolean;
    get showSupportingText(): boolean;
    formatFileMeta(file: File): string;
}
export {};