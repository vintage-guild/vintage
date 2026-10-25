/**
 * @beta
 */
export interface LinkHandler {
    connect(): void;
    disconnect(): void;
}
/**
 * @beta
 */
export declare class DefaultLinkHandler implements LinkHandler {
    private handler;
    connect(): void;
    disconnect(): void;
    private getEventInfo;
    private findClosestAnchor;
    private targetIsThisWindow;
}
