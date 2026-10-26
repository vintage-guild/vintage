import { CSSDirective } from "./css-directive.js";
import { ElementStyles } from "./element-styles.js";
function collectStyles(strings, values) {
    const styles = [];
    let cssString = "";
    for (let i = 0, ii = strings.length - 1; i < ii; ++i) {
        cssString += strings[i];
        let value = values[i];
        if (CSSDirective.getForInstance(value) !== void 0) {
            value = value.createCSS();
        }
        if (value instanceof ElementStyles || value instanceof CSSStyleSheet) {
            if (cssString.trim() !== "") {
                styles.push(cssString);
                cssString = "";
            }
            styles.push(value);
        }
        else {
            cssString += value;
        }
    }
    cssString += strings[strings.length - 1];
    if (cssString.trim() !== "") {
        styles.push(cssString);
    }
    return styles;
}
/**
 * Transforms a template literal string into styles.
 * @param strings - The string fragments that are interpolated with the values.
 * @param values - The values that are interpolated with the string fragments.
 * @remarks
 * The css helper supports interpolation of static composable styles and CSS directives.
 * @public
 */
export const css = ((strings, ...values) => {
    return new ElementStyles(collectStyles(strings, values));
});
class CSSPartial {
    constructor(styles) {
        this.value =
            styles.length === 0
                ? ""
                : styles.length === 1
                    ? styles[0]
                    : new ElementStyles(styles);
    }
    createCSS() {
        return this.value;
    }
}
CSSDirective.define(CSSPartial);
css.partial = (strings, ...values) => {
    return new CSSPartial(collectStyles(strings, values));
};
