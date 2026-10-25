let DefaultStyleStrategy;
function reduceStyles(styles) {
    return styles.reduce((reduced, current) => {
        if (current instanceof ElementStyles) {
            reduced.push(...reduceStyles(current.styles));
        }
        else {
            reduced.push(current);
        }
        return reduced;
    }, []);
}
/**
 * Represents styles that can be applied to a custom element.
 * @public
 */
export class ElementStyles {
    /**
     * Gets the StyleStrategy associated with these element styles.
     */
    get strategy() {
        if (this._strategy === null) {
            if (!DefaultStyleStrategy) {
                ElementStyles.setDefaultStrategy(ElementStyles.supportsAdoptedStyleSheets
                    ? createAdoptedSheetsStrategy()
                    : createStyleElementStrategy());
            }
            this.withStrategy(DefaultStyleStrategy);
        }
        return this._strategy;
    }
    /**
     * Creates an instance of ElementStyles.
     * @param styles - The styles that will be associated with elements.
     */
    constructor(styles) {
        this.styles = styles;
        this.targets = new WeakSet();
        this._strategy = null;
    }
    /** @internal */
    addStylesTo(target) {
        this.strategy.addStylesTo(target);
        this.targets.add(target);
    }
    /** @internal */
    removeStylesFrom(target) {
        this.strategy.removeStylesFrom(target);
        this.targets.delete(target);
    }
    /** @internal */
    isAttachedTo(target) {
        return this.targets.has(target);
    }
    /**
     * Sets the strategy that handles adding/removing these styles for an element.
     * @param strategy - The strategy to use.
     */
    withStrategy(Strategy) {
        this._strategy = new Strategy(reduceStyles(this.styles));
        return this;
    }
    /**
     * Sets the default strategy type to use when creating style strategies.
     * @param Strategy - The strategy type to construct.
     */
    static setDefaultStrategy(Strategy) {
        DefaultStyleStrategy = Strategy;
    }
    /**
     * Normalizes a set of composable style options.
     * @param styles - The style options to normalize.
     * @returns A singular ElementStyles instance or undefined.
     */
    static normalize(styles) {
        return styles === void 0
            ? void 0
            : Array.isArray(styles)
                ? new ElementStyles(styles)
                : styles instanceof ElementStyles
                    ? styles
                    : new ElementStyles([styles]);
    }
}
/**
 * Indicates whether the DOM supports the adoptedStyleSheets feature.
 */
ElementStyles.supportsAdoptedStyleSheets = Array.isArray(document.adoptedStyleSheets) &&
    "replace" in CSSStyleSheet.prototype;
// Fallback strategy factories used when no strategy has been explicitly set
// via ElementStyles.setDefaultStrategy (e.g. when importing only from the
// styles.js subpath without loading element-controller.ts).
function createAdoptedSheetsStrategy() {
    const cache = new Map();
    return class FallbackAdoptedSheetsStrategy {
        constructor(styles) {
            this.sheets = styles.map(x => {
                if (x instanceof CSSStyleSheet) {
                    return x;
                }
                let sheet = cache.get(x);
                if (sheet === void 0) {
                    sheet = new CSSStyleSheet();
                    sheet.replaceSync(x);
                    cache.set(x, sheet);
                }
                return sheet;
            });
        }
        addStylesTo(target) {
            const t = target;
            t.adoptedStyleSheets = [...t.adoptedStyleSheets, ...this.sheets];
        }
        removeStylesFrom(target) {
            const t = target;
            t.adoptedStyleSheets = t.adoptedStyleSheets.filter((x) => this.sheets.indexOf(x) === -1);
        }
    };
}
let fallbackStyleId = 0;
function createStyleElementStrategy() {
    return class FallbackStyleElementStrategy {
        constructor(styles) {
            this.styles = styles;
            this.styleClass = `fast-${++fallbackStyleId}`;
        }
        addStylesTo(target) {
            const t = target === document ? document.body : target;
            for (let i = 0; i < this.styles.length; i++) {
                const element = document.createElement("style");
                element.innerHTML = this.styles[i];
                element.className = this.styleClass;
                t.append(element);
            }
        }
        removeStylesFrom(target) {
            const t = target === document ? document.body : target;
            const styles = t.querySelectorAll(`.${this.styleClass}`);
            for (let i = 0, ii = styles.length; i < ii; ++i) {
                t.removeChild(styles[i]);
            }
        }
    };
}
