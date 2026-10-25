import { FASTElement } from "@lushly-dev/fast-element";
import "../file-upload/violet-file-upload";
import "../icon-button/violet-icon-button";
import "../icon/violet-icon";
import "../image/violet-image";
import { type VioletDataGridAttachmentItem } from "./violet-data-grid-attachment-cell-values";
export type VioletDataGridAttachmentCellChangeDetail = {
    attachments: VioletDataGridAttachmentItem[];
    value: string;
};
export type VioletDataGridAttachmentCellUploadRequestDetail = {
    files: File[];
    attachments: VioletDataGridAttachmentItem[];
};
/**
 * Compact attachment renderer/editor for dense grid cells.
 *
 * @summary Grid-native attachment cell with thumbnail-or-chip previews, compact list editing, and deferred commit on close.
 * @fires input - Emitted whenever the pending attachment list changes while the panel is open.
 * @fires change - Emitted on close with durable attachments matching the parsed serialized value, excluding owned thumbnail URLs.
 * @fires upload-request - Upload intent with `{ files, attachments }` before the uploader is cleared. Hosts own persistence and can replace items by id with durable URLs; the cell does not upload files.
 * @csspart base - Root wrapper for the attachment cell.
 * @csspart trigger - Trigger button that opens the attachment panel.
 * @csspart selection - Visible attachment preview surface rendered inside the trigger.
 * @csspart overflow-pill - Overflow count chip when more attachments exist than can be shown inline.
 * @csspart caret - Caret icon inside the trigger.
 * @csspart panel - Floating attachment panel.
 * @csspart selection-summary - Compact summary row describing the current attachment count.
 * @csspart attachment-list - Wrapper around the current attachment rows.
 * @csspart attachment-row - Individual attachment row inside the panel.
 * @csspart add-control - Inline add-files control shown in editable mode.
 * @csspart remove-button - Remove action for an attachment row.
 * @csspart empty-state - Empty message shown when no attachments exist.
 */
export declare class VioletDataGridAttachmentCell extends FASTElement {
    #private;
    placeholder: string;
    disabled: boolean;
    readonly: boolean;
    attachments: VioletDataGridAttachmentItem[];
    open: boolean;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get value(): string;
    set value(nextValue: string);
    get panelId(): string;
    get visibleAttachments(): VioletDataGridAttachmentItem[];
    get overflowCount(): number;
    get selectionLabel(): string;
    get selectionSummary(): string;
    attachmentsChanged(previous: VioletDataGridAttachmentItem[] | undefined, next: VioletDataGridAttachmentItem[] | undefined): void;
    handleTriggerClick(): void;
    disabledChanged(): void;
    handlePanelToggle(event: ToggleEvent): void;
    handlePanelKeydown(event: KeyboardEvent): void;
    handleUploadChange(event: Event): void;
    appendFiles(files: readonly File[]): void;
    appendAttachments(items: readonly VioletDataGridAttachmentItem[]): void;
    removeAttachmentById(id: string): void;
    isImageItem(item: VioletDataGridAttachmentItem): boolean;
    private applyAttachments;
    private close;
    private focusTrigger;
    private panelElement;
    private startPanelTracking;
    private stopPanelTracking;
    private positionPanel;
    private setAttachments;
    private syncOwnedPreviewUrls;
    private releaseAllOwnedPreviewUrls;
}