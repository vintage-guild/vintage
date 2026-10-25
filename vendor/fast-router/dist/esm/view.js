import { __awaiter } from "tslib";
import { ElementStyles, html, } from "@lushly-dev/fast-element";
import { isFASTElementHost } from "./router.js";
/**
 * @beta
 */
export const Transition = Object.freeze({
    default: Object.freeze({
        begin(host, prev, next) {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        rollback(host, prev, next) {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        commit(host, prev, next) {
            return __awaiter(this, void 0, void 0, function* () { });
        },
    }),
});
/**
 * @beta
 */
export class FASTElementLayout {
    constructor(template = null, styles = undefined, runBeforeCommit = true) {
        var _a;
        this.template = template;
        this.runBeforeCommit = runBeforeCommit;
        this.styles = (_a = ElementStyles.normalize(styles)) !== null && _a !== void 0 ? _a : null;
    }
    beforeCommit(routerElement) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.runBeforeCommit) {
                this.apply(routerElement);
            }
        });
    }
    afterCommit(routerElement) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.runBeforeCommit) {
                this.apply(routerElement);
            }
        });
    }
    apply(routerElement) {
        if (isFASTElementHost(routerElement)) {
            if (routerElement.$fastController.template !== this.template) {
                routerElement.$fastController.template = this.template;
            }
            if (routerElement.$fastController.mainStyles !== this.styles) {
                routerElement.$fastController.mainStyles = this.styles;
            }
        }
    }
}
/**
 * @beta
 */
export const Layout = Object.freeze({
    default: new FASTElementLayout(html `
            <slot></slot>
        `),
});
