import { DOMAspect } from "../dom.js";
import { aspectLabelAttribute, aspectLabelBooleanAttribute, aspectLabelContent, aspectLabelEvent, aspectLabelProperty, aspectLabelTokenList, aspectLabelUnknown, formatAspect, formatExpectedTarget, formatRichMismatchMessage, unknownHostName, } from "./messages.js";
const aspectLabelsByCode = Object.freeze({
    [DOMAspect.attribute]: aspectLabelAttribute,
    [DOMAspect.booleanAttribute]: aspectLabelBooleanAttribute,
    [DOMAspect.property]: aspectLabelProperty,
    [DOMAspect.content]: aspectLabelContent,
    [DOMAspect.tokenList]: aspectLabelTokenList,
    [DOMAspect.event]: aspectLabelEvent,
});
const defaultSnippetLength = 500;
function describeAspect(aspectType, sourceAspect) {
    var _a;
    const base = aspectType !== undefined
        ? ((_a = aspectLabelsByCode[aspectType]) !== null && _a !== void 0 ? _a : aspectLabelUnknown)
        : aspectLabelUnknown;
    return formatAspect(base, sourceAspect);
}
function describeExpectedTarget(factory) {
    var _a;
    const aspectType = factory.aspectType;
    const sourceAspect = factory.sourceAspect;
    return {
        tagName: (_a = factory.targetTagName) !== null && _a !== void 0 ? _a : null,
        aspect: describeAspect(aspectType, sourceAspect),
    };
}
function stripEmptyComments(root) {
    var _a;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const empties = [];
    let current;
    while ((current = walker.nextNode()) !== null) {
        if (current.data === "") {
            empties.push(current);
        }
    }
    for (const comment of empties) {
        (_a = comment.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(comment);
    }
}
function truncate(value, maxLength) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
function serializeNodeForError(node, maxLength = defaultSnippetLength) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(node.cloneNode(true));
    stripEmptyComments(wrapper);
    return truncate(wrapper.innerHTML.trim(), maxLength);
}
function serializeRangeForError(first, last, maxLength = defaultSnippetLength) {
    const wrapper = document.createElement("div");
    let current = first;
    while (current !== null) {
        wrapper.appendChild(current.cloneNode(true));
        if (current === last) {
            break;
        }
        current = current.nextSibling;
    }
    stripEmptyComments(wrapper);
    return truncate(wrapper.innerHTML.trim(), maxLength);
}
function formatMismatchMessage(hostName, expected, received) {
    const host = (hostName !== null && hostName !== void 0 ? hostName : unknownHostName).toLowerCase();
    const expectedText = typeof expected === "string"
        ? expected
        : formatExpectedTarget(expected.tagName, expected.aspect);
    return formatRichMismatchMessage(host, expectedText, received.html);
}
const richDiagnostic = {
    formatBindingMismatch(factory, firstChild, lastChild, hostName) {
        const expected = describeExpectedTarget(factory);
        const received = {
            html: serializeRangeForError(firstChild, lastChild),
        };
        const result = {
            message: formatMismatchMessage(hostName, expected, received),
            expected,
            received,
        };
        return result;
    },
    formatStructuralError(node, hostName, expectedDescription) {
        const received = {
            html: serializeNodeForError(node),
        };
        const result = {
            message: formatMismatchMessage(hostName, expectedDescription, received),
            expected: expectedDescription,
            received,
        };
        return result;
    },
};
/**
 * Returns a {@link HydrationDebugger} that, when supplied to
 * `enableHydration({ debugger })`, installs the rich hydration mismatch
 * formatter: a single-line "Expected … / Received …" message plus an HTML
 * snippet of the SSR DOM and structured `expected`/`received` fields on
 * the thrown error (both `HydrationBindingError` and
 * `HydrationTargetElementError`).
 *
 * Without the debugger, hydration errors emit only a minimal one-line
 * message pointing at this function — keeping the runtime hydration cost
 * small for production bundles that do not need rich diagnostics.
 *
 * @public
 */
export function hydrationDebugger() {
    return { diagnostic: richDiagnostic };
}
