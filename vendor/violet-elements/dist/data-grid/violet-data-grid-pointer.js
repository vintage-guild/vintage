export function beginPointerSelection(pointerId, anchor) {
    return {
        anchor,
        pointerId,
        moved: false,
    };
}
export function isPointerSelectionEventForSession(session, pointerId) {
    return session.pointerId !== null && session.anchor !== null && session.pointerId === pointerId;
}
export function markPointerSelectionMoved(session) {
    return {
        ...session,
        moved: true,
    };
}
export function clearedPointerSelectionSession() {
    return {
        anchor: null,
        pointerId: null,
        moved: false,
    };
}
export function pointerSelectionSuppressesNextClick(session, suppressRequested) {
    return suppressRequested && session.moved;
}
export function beginFillDrag(pointerId, sourceRange) {
    if (!sourceRange) {
        return null;
    }
    return {
        pointerId,
        sourceRange,
    };
}
export function isFillPointerEventForSession(session, pointerId) {
    return session.pointerId !== null && session.pointerId === pointerId;
}
export function clearedFillSession() {
    return {
        pointerId: null,
        sourceRange: null,
    };
}