export interface VioletDataGridResizeSession {
    pointerId: number | null;
    columnId: string | null;
    startX: number;
    startWidth: number;
}
export declare function beginColumnResize(options: {
    button: number;
    pointerId: number;
    columnId: string;
    clientX: number;
    startWidth: number;
}): VioletDataGridResizeSession | null;
export declare function isColumnResizeEventForSession(session: VioletDataGridResizeSession, pointerId: number): boolean;
export declare function resizedColumnWidth(options: {
    session: VioletDataGridResizeSession;
    clientX: number;
    minimumWidth: number;
}): number;
export declare function clearedColumnResizeSession(): VioletDataGridResizeSession;