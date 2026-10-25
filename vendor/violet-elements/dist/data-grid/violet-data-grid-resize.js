export function beginColumnResize(options) {
    if (options.button !== 0) {
        return null;
    }
    return {
        pointerId: options.pointerId,
        columnId: options.columnId,
        startX: options.clientX,
        startWidth: options.startWidth,
    };
}
export function isColumnResizeEventForSession(session, pointerId) {
    return session.pointerId !== null && session.columnId !== null && pointerId === session.pointerId;
}
export function resizedColumnWidth(options) {
    return Math.max(options.minimumWidth, Math.round(options.session.startWidth + (options.clientX - options.session.startX)));
}
export function clearedColumnResizeSession() {
    return {
        pointerId: null,
        columnId: null,
        startX: 0,
        startWidth: 0,
    };
}