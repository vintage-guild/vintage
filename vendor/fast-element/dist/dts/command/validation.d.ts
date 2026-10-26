/**
 * Validation commands for FAST elements.
 * Provides linting and accessibility auditing capabilities.
 *
 * @remarks
 * Task 10: Implements fast.lint.check for code validation against FAST best practices.
 * Task 11: Implements fast.a11y.audit for accessibility auditing.
 */
/**
 * Severity level for lint issues.
 * @public
 */
export type LintSeverity = "error" | "warning" | "info";
/**
 * A single lint issue found in code.
 * @public
 */
export interface LintIssue {
    /** Rule ID that triggered the issue */
    rule: string;
    /** Issue severity */
    severity: LintSeverity;
    /** Human-readable message describing the issue */
    message: string;
    /** Line number where the issue occurs (1-indexed) */
    line: number;
    /** Column number where the issue occurs (1-indexed) */
    column: number;
    /** Suggested fix for the issue */
    fix?: string;
    /** Confidence level for the suggested fix (0-1) */
    fixConfidence?: number;
}
/**
 * Issue counts by severity level.
 * @public
 */
export interface LintCounts {
    error: number;
    warning: number;
    info: number;
}
/**
 * A plan step for fixing a lint issue.
 * @public
 */
export interface LintPlanStep {
    /** Step number (1-indexed) */
    step: number;
    /** Action to take to fix the issue */
    action: string;
    /** Confidence level for this fix (0-1) */
    confidence: number;
}
/**
 * Result of a lint check operation.
 * @public
 */
export interface LintResult {
    /** Array of lint issues found */
    issues: LintIssue[];
    /** Issue counts by severity */
    counts: LintCounts;
}
/**
 * WCAG conformance level.
 * @public
 */
export type WcagLevel = "A" | "AA" | "AAA";
/**
 * Impact severity for accessibility violations.
 * @public
 */
export type A11yImpact = "minor" | "moderate" | "serious" | "critical";
/**
 * A single accessibility violation found during audit.
 * @public
 */
export interface A11yViolation {
    /** WCAG rule ID that was violated (e.g., "color-contrast", "aria-label") */
    rule: string;
    /** Impact severity of the violation */
    impact: A11yImpact;
    /** CSS selector identifying the violating element */
    selector: string;
    /** WCAG level this rule applies to */
    wcagLevel: WcagLevel;
    /** Human-readable description of the violation */
    message: string;
    /** WCAG success criterion reference (e.g., "1.4.3") */
    wcagCriterion?: string;
}
/**
 * Result of an accessibility audit operation.
 * @public
 */
export interface A11yAuditResult {
    /** Array of accessibility violations found */
    violations: A11yViolation[];
    /** WCAG level used for the audit */
    level: WcagLevel;
    /** Target element selector that was audited */
    target: string;
}
/**
 * Register fast.lint.* and fast.a11y.* commands with the CommandRegistry.
 * Called during fast-element initialization.
 *
 * @remarks
 * These commands provide code validation and accessibility auditing:
 * - fast.lint.check: Validates code against FAST best practices
 * - fast.a11y.audit: Runs WCAG accessibility audit on DOM elements
 *
 * @public
 */
export declare function registerValidationCommands(): void;
