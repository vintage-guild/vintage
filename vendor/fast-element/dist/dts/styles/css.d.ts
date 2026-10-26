import { CSSDirective } from "./css-directive.js";
import { type ComposableStyles, ElementStyles } from "./element-styles.js";
/**
 * Represents the types of values that can be interpolated into a template.
 * @public
 */
export type CSSValue = ComposableStyles | CSSDirective;
/**
 * Transforms a template literal string into styles.
 * @param strings - The string fragments that are interpolated with the values.
 * @param values - The values that are interpolated with the string fragments.
 * @remarks
 * The css helper supports interpolation of static composable styles and CSS directives.
 * Use the .partial method to create partial CSS fragments.
 * @public
 */
export type CSSTemplateTag = ((strings: TemplateStringsArray, ...values: CSSValue[]) => ElementStyles) & {
    /**
     * Transforms a template literal string into partial CSS.
     * @param strings - The string fragments that are interpolated with the values.
     * @param values - The values that are interpolated with the string fragments.
     * @public
     */
    partial(strings: TemplateStringsArray, ...values: CSSValue[]): CSSDirective;
};
/**
 * Transforms a template literal string into styles.
 * @param strings - The string fragments that are interpolated with the values.
 * @param values - The values that are interpolated with the string fragments.
 * @remarks
 * The css helper supports interpolation of static composable styles and CSS directives.
 * @public
 */
export declare const css: CSSTemplateTag;
