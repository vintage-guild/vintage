#!/usr/bin/env node
// Squash merges use the PR title as the commit subject on main, so the title must pass the same
// Conventional Commits rules as any commit. Rules come from commitlint.config.mjs (one source).
// Fully automated bot PRs (Dependabot) are exempt, matching the attribution policy in AGENTS.md.
import config from '../commitlint.config.mjs';

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9-]+)\))?(?<breaking>!)?: (?<subject>.+)$/;

const ruleValues = (name) => config.rules[name]?.[2] ?? [];

/** Problems with a PR title; empty when it's a valid conventional commit header. */
export function checkTitle(title) {
  const match = HEADER.exec(title.trim());
  if (!match)
    return ['must look like "type(scope): subject", e.g. "feat(identity): add character-update"'];
  const { type, scope, subject } = match.groups;
  const problems = [];
  if (!ruleValues('type-enum').includes(type)) {
    problems.push(`type "${type}" must be one of: ${ruleValues('type-enum').join(', ')}`);
  }
  if (scope && !ruleValues('scope-enum').includes(scope)) {
    problems.push(`scope "${scope}" isn't in commitlint.config.mjs scope-enum`);
  }
  const maxLength = config.rules['subject-max-length']?.[2] ?? 72;
  if (subject.length > maxLength) problems.push(`subject is longer than ${maxLength} characters`);
  if (subject.endsWith('.')) problems.push('subject must not end with a period');
  if (/^[A-Z]/.test(subject)) problems.push('subject must start lowercase');
  return problems;
}

if (process.argv[1]?.endsWith('check-pr-title.mjs')) {
  const [title = '', author = ''] = process.argv.slice(2);
  if (author.endsWith('[bot]')) {
    console.log(`PR by ${author}: fully automated, title check skipped.`);
    process.exit(0);
  }
  const problems = checkTitle(title);
  if (problems.length) {
    console.error(`PR title "${title}" is used as the squash commit on main; fix it:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`PR title OK: ${title}`);
}
