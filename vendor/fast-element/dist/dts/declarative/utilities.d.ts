import { type JSONSchema, type Schema } from "../components/schema.js";
import { attributeDirectivePrefix, clientSideCloseExpression, clientSideOpenExpression, closeExpression, eventArgAccessor, executionContextAccessor, openExpression } from "./syntax.js";
export { assignObservables, assignProxy, deepEqual, deepMerge, findDef, isPlainObject, } from "./observer-map-utilities.js";
/**
 * Declarative behavior type.
 * @public
 */
export type BehaviorType = "dataBinding" | "templateDirective";
/**
 * Declarative attribute directive names.
 * @public
 */
export type AttributeDirective = "children" | "slotted" | "ref";
/**
 * Declarative data binding marker type.
 * @public
 */
export type DataBindingBindingType = "client" | "default" | "unescaped";
/**
 * Base behavior configuration.
 * @public
 */
export interface BehaviorConfig {
    type: BehaviorType;
}
/**
 * Declarative schema path type.
 * @public
 */
export type PathType = "access" | "default" | "event" | "repeat";
/**
 * Content binding behavior configuration.
 * @public
 */
export interface ContentDataBindingBehaviorConfig extends BaseDataBindingBehaviorConfig {
    subtype: "content";
}
/**
 * Attribute binding behavior configuration.
 * @public
 */
export interface AttributeDataBindingBehaviorConfig extends BaseDataBindingBehaviorConfig {
    subtype: "attribute";
    aspect: "@" | ":" | "?" | null;
}
/**
 * Attribute directive binding behavior configuration.
 * @public
 */
export interface AttributeDirectiveBindingBehaviorConfig extends BaseDataBindingBehaviorConfig {
    subtype: "attributeDirective";
    name: AttributeDirective;
}
/**
 * Declarative data binding behavior configuration.
 * @public
 */
export type DataBindingBehaviorConfig = ContentDataBindingBehaviorConfig | AttributeDataBindingBehaviorConfig | AttributeDirectiveBindingBehaviorConfig;
/**
 * Base data binding behavior configuration.
 * @public
 */
export interface BaseDataBindingBehaviorConfig extends BehaviorConfig {
    type: "dataBinding";
    bindingType: DataBindingBindingType;
    openingStartIndex: number;
    openingEndIndex: number;
    closingStartIndex: number;
    closingEndIndex: number;
}
/**
 * Declarative template directive names.
 * @public
 */
export type TemplateDirective = "when" | "repeat";
/**
 * Template directive behavior configuration.
 * @public
 */
export interface TemplateDirectiveBehaviorConfig extends BehaviorConfig {
    type: "templateDirective";
    name: TemplateDirective;
    value: string;
    openingTagStartIndex: number;
    openingTagEndIndex: number;
    closingTagStartIndex: number;
    closingTagEndIndex: number;
}
/**
 * Map between child component attribute references and custom element names.
 * @public
 */
export interface ChildrenMap {
    customElementName: string;
    attributeName: string;
}
/**
 * Prefix used for execution context paths.
 * @public
 */
export declare const contextPrefixDot: string;
export { attributeDirectivePrefix, clientSideCloseExpression, clientSideOpenExpression, closeExpression, eventArgAccessor, executionContextAccessor, openExpression, };
/**
 * The type of a parsed event handler argument.
 * @public
 */
export type EventArgType = "event" | "context" | "binding";
/**
 * A parsed event handler argument descriptor.
 * @public
 */
export interface ParsedEventArg {
    type: EventArgType;
    /** The raw argument string, present only when `type` is `"binding"`. */
    rawArg?: string;
}
/**
 * Parses the arguments string of an event handler binding into an array of
 * typed argument descriptors. Unrecognised tokens are returned as `"binding"`
 * type with their raw string preserved.
 *
 * Special arguments:
 * - `$e` — resolves to the DOM event object
 * - `$c` — resolves to the full execution context object
 *
 * Any other token is treated as a binding path and resolved against the current
 * data source.
 *
 * @param argsString - The raw arguments string from between the parentheses,
 *   e.g. `""`, `"$e"`, `"$c"`, or `"$e, $c"`.
 * @returns An array of {@link ParsedEventArg} descriptors.
 * @public
 */
export declare function parseEventArgs(argsString: string): ParsedEventArg[];
/**
 * Logical operator tokens.
 * @public
 */
export declare const LogicalOperator: {
    readonly AND: "&&";
    readonly OR: "||";
};
/**
 * Logical operator token.
 * @public
 */
export type LogicalOperator = (typeof LogicalOperator)[keyof typeof LogicalOperator];
/**
 * Comparison operator tokens.
 * @public
 */
export declare const ComparisonOperator: {
    readonly ACCESS: "access";
    readonly EQUALS: "==";
    readonly GREATER_THAN: ">";
    readonly GREATER_THAN_OR_EQUALS: ">=";
    readonly LESS_THAN: "<";
    readonly LESS_THAN_OR_EQUALS: "<=";
    readonly NOT: "!";
    readonly NOT_EQUALS: "!=";
};
/**
 * Comparison operator token.
 * @public
 */
export type ComparisonOperator = (typeof ComparisonOperator)[keyof typeof ComparisonOperator];
/**
 * Declarative expression operator tokens.
 * @public
 */
export declare const Operator: {
    readonly ACCESS: "access";
    readonly EQUALS: "==";
    readonly GREATER_THAN: ">";
    readonly GREATER_THAN_OR_EQUALS: ">=";
    readonly LESS_THAN: "<";
    readonly LESS_THAN_OR_EQUALS: "<=";
    readonly NOT: "!";
    readonly NOT_EQUALS: "!=";
    readonly AND: "&&";
    readonly OR: "||";
};
/**
 * Declarative expression operator token.
 * @public
 */
export type Operator = (typeof Operator)[keyof typeof Operator];
/**
 * Get the index of the next matching tag
 * @param openingTagStartSlice - The slice starting from the opening tag
 * @param openingTag - The opening tag string
 * @param closingTag - The closing tag
 * @param openingTagStartIndex - The opening tag start index derived from the innerHTML
 * @returns index
 * @public
 */
export declare function getIndexOfNextMatchingTag(openingTagStartSlice: string, openingTag: string, closingTag: string, openingTagStartIndex: number): number;
/**
 * Get the next behavior
 * @param innerHTML - The innerHTML string to evaluate
 * @param offset - The current offset in the original string.
 * @returns DataBindingBehaviorConfig | DirectiveBehaviorConfig | null - A configuration object or null
 * @public
 */
export declare function getNextBehavior(innerHTML: string, offset?: number): DataBindingBehaviorConfig | TemplateDirectiveBehaviorConfig | null;
/**
 * Create a function to resolve a value from an object using a path with dot syntax.
 * e.g. "foo.bar"
 * @param path - The dot syntax path to an objects property.
 * @param contextPath - The current repeat context path.
 * @param level - The current repeat nesting level.
 * @param rootSchema - The root schema for resolving context paths.
 * @returns A function to access the value from a given path.
 * @public
 */
export declare function pathResolver(path: string, contextPath: string | null, level: number, rootSchema: JSONSchema): (accessibleObject: any, context: any) => any;
/**
 * Creates a binding resolver and records the binding path in the schema.
 * @param previousString - The previous literal string before the binding.
 * @param rootPropertyName - The current root property name.
 * @param path - The binding path to resolve.
 * @param parentContext - The parent repeat context.
 * @param type - The schema path type.
 * @param schema - The schema to record paths in.
 * @param currentContext - The current repeat context.
 * @param level - The current repeat nesting level.
 * @returns A function that resolves the binding path.
 * @public
 */
export declare function bindingResolver(previousString: string | null, rootPropertyName: string | null, path: string, parentContext: string | null, type: PathType, schema: Schema, currentContext: string | null, level: number): (accessibleObject: any, context: any) => any;
/**
 * Creates a resolver for a chained expression and records its paths in the schema.
 * @param rootPropertyName - The current root property name.
 * @param expression - The expression to resolve.
 * @param parentContext - The parent repeat context.
 * @param level - The current repeat nesting level.
 * @param schema - The schema to record paths in.
 * @returns A function that resolves the expression.
 * @public
 */
export declare function expressionResolver(rootPropertyName: string | null, expression: ChainedExpression, parentContext: string | null, level: number, schema: Schema): (accessibleObject: any, context: any) => any;
/**
 * Extracts all paths from a ChainedExpression, including nested expressions
 * @param chainedExpression - The chained expression to extract paths from
 * @returns A Set containing all unique paths found in the expression chain
 * @public
 */
export declare function extractPathsFromChainedExpression(chainedExpression: ChainedExpression): Set<string>;
/**
 * Declarative expression descriptor.
 * @public
 */
export interface DeclarativeExpression {
    operator: Operator;
    left: string;
    leftIsValue: boolean | null;
    right: string | boolean | number | null;
    rightIsValue: boolean | null;
}
/**
 * Declarative chained expression descriptor.
 * @public
 */
export interface ChainedExpression {
    operator?: LogicalOperator;
    expression: DeclarativeExpression;
    next?: ChainedExpression;
}
/**
 * Gets the expression chain as a configuration object
 * @param value - The binding string value
 * @returns - A configuration object containing information about the expression
 * @public
 */
export declare function getExpressionChain(value: string): ChainedExpression | void;
/**
 * This is the transform utility for rationalizing declarative HTML syntax
 * with bindings in the ViewTemplate
 * @param innerHTML - The innerHTML to transform.
 * @param index - The index to start the current slice of HTML to evaluate.
 * @public
 */
export declare function transformInnerHTML(innerHTML: string, index?: number): string;
/**
 * Tag name of the HTML element whose contents are auto-escaped to render
 * code samples literally. Inside this element FAST binding delimiters
 * (`{{...}}`, `{{{...}}}`, `{...}`) are neutralised by replacing each
 * `{` / `}` with the HTML numeric character reference `&#123;` /
 * `&#125;` so the literal text is rendered instead of a binding.
 *
 * The escape behaviour is split between the server-side renderer
 * (`escape_code_sample_elements` in `microsoft-fast-build`) and the
 * client-side `<f-template>` parser (`escapeBracesInCodeElements`
 * below):
 *
 *  - Curly-brace escape runs in **both** server and client because
 *    `&#123;` / `&#125;` are decoded to literal `{` / `}` in the DOM
 *    and the `.innerHTML` serializer does not re-encode them — so the
 *    server-side escape would otherwise be undone on the client.
 *  - Angle brackets of FAST directive tags (`<f-when>`, `</f-when>`,
 *    `<f-repeat>`, `</f-repeat>`, case-insensitive) inside this element
 *    are escaped on the **server only**. The DOM serializer
 *    re-encodes `<` / `>` in text content automatically, so the client
 *    never sees raw directive tags inside `<code>` regardless of what
 *    the page source contained.
 *  - Real HTML elements (`<button>`) and custom elements (`<my-widget>`)
 *    inside this element keep their angle brackets and continue to
 *    render as live DOM elements; only the brace-binding syntax inside
 *    their text and attribute values is neutralised.
 * @public
 */
export declare const codeElementName = "code";
/**
 * Preprocess an HTML string by escaping FAST brace characters inside every
 * `<code>` element. Mirrors part of the brace/angle-bracket escaping
 * behaviour of Microsoft WebUI's `webui-press` markdown renderer so that
 * example template snippets inside `<code>` render literally instead of
 * being interpreted as bindings.
 *
 * Nested `<code>` elements are handled via depth tracking. The pass is
 * idempotent because `{` / `}` inside an already-processed `<code>` have
 * been replaced with entities, so a second pass finds nothing to escape.
 *
 * This is the client-side half of a two-stage escape — see the JSDoc on
 * {@link codeElementName} for why only braces are handled here and
 * `<` / `>` are exclusively handled on the server.
 * @public
 */
export declare function escapeBracesInCodeElements(innerHTML: string): string;
/**
 * Resolves boolean logic
 * used for f-when and boolean attributes
 * @param rootPropertyName - The current root property name.
 * @param expression - The chained expression to resolve.
 * @param parentContext - The parent repeat context.
 * @param level - The current repeat nesting level.
 * @param schema - The schema to record paths in.
 * @returns - A binding that resolves the chained expression logic
 * @public
 */
export declare function getBooleanBinding(rootPropertyName: string | null, expression: ChainedExpression, parentContext: string | null, level: number, schema: Schema): (x: boolean, c: any) => any;
/**
 * Get the root property name
 * @param rootPropertyName - The root property
 * @param path - The dot syntax path
 * @param context - The context created by a repeat
 * @param type - The type of path binding
 * @returns
 * @public
 */
export declare function getRootPropertyName(rootPropertyName: string | null, path: string, context: null | string, type: PathType): string | null;
/**
 * Get details of bindings to the attributes of child custom elements
 * @param previousString - The previous string before the binding
 * @returns null, or a custom element name and attribute name
 * @public
 */
export declare function getChildrenMap(previousString: string | null): ChildrenMap | null;
