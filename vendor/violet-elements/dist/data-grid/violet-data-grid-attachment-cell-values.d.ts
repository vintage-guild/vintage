export type VioletDataGridAttachmentKind = "image" | "document";
export interface VioletDataGridAttachmentItem {
    id: string;
    label: string;
    kind?: VioletDataGridAttachmentKind;
    previewSrc?: string;
    meta?: string;
}
export declare function normalizeAttachmentItems(values: readonly unknown[]): VioletDataGridAttachmentItem[];
export declare function parseAttachmentCellValue(value: unknown): VioletDataGridAttachmentItem[];
export declare function serializeAttachmentCellValue(values: readonly unknown[]): string;
export declare function attachmentItemsFromFiles(files: readonly File[]): VioletDataGridAttachmentItem[];
export declare function isImageAttachment(item: VioletDataGridAttachmentItem): boolean;
export declare function getOwnedAttachmentPreviewUrl(item: VioletDataGridAttachmentItem): string | undefined;
export declare function clearOwnedAttachmentPreview(item: VioletDataGridAttachmentItem): void;