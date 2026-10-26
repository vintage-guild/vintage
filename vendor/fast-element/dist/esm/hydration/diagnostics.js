import { formatDefaultMismatchMessage, unknownHostName } from "./messages.js";
function formatMinimalMessage(hostName, detail) {
    const host = (hostName !== null && hostName !== void 0 ? hostName : unknownHostName).toLowerCase();
    return formatDefaultMismatchMessage(host, detail);
}
const defaultDiagnostic = {
    formatBindingMismatch(_factory, _firstChild, _lastChild, hostName) {
        return {
            message: formatMinimalMessage(hostName, undefined),
        };
    },
    formatStructuralError(_node, hostName, expectedDescription) {
        return {
            message: formatMinimalMessage(hostName, expectedDescription),
        };
    },
};
let activeDiagnostic = defaultDiagnostic;
/**
 * Installs a {@link HydrationDiagnostic} as the active formatter for
 * hydration mismatch errors. Called by `enableHydration()` when an opt-in
 * debugger configuration is supplied; not exposed as `@public` because
 * library consumers should always go through `enableHydration` to install
 * a debugger.
 * @internal
 */
export function installHydrationDiagnostic(diagnostic) {
    activeDiagnostic = diagnostic;
}
/**
 * Returns the currently active {@link HydrationDiagnostic} — either the
 * minimal default or one installed by an opt-in debugger.
 * @internal
 */
export function getHydrationDiagnostic() {
    return activeDiagnostic;
}
/**
 * Reads the host element's tag name from any node inside a hydration view.
 * Returns `undefined` when the node is not inside a shadow root.
 * @internal
 */
export function getHostName(node) {
    var _a;
    if (!node) {
        return undefined;
    }
    const root = node.getRootNode();
    return (_a = root.host) === null || _a === void 0 ? void 0 : _a.nodeName;
}
