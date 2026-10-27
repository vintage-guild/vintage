#!/usr/bin/env node
// Compares commands.manifest.json against the base branch (PLAN §3.3). A removed command, a
// raised tier, a newly required input field, a new confirmation step, or a command that became
// system-only breaks callers (agents, CLI scripts, the addon), so it needs the
// `breaking-contract` label on the PR.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Keep in step with packages/guild-kit/src/tiers.ts.
const TIERS = ['public', 'member', 'recruit', 'raider', 'leader', 'officer'];

/** How one command that still exists breaks its callers, if it does. */
function breaksOf(old, now) {
  const breaks = [];
  if (TIERS.indexOf(now.tier) > TIERS.indexOf(old.tier)) {
    breaks.push(`tier raised ${old.tier} → ${now.tier}`);
  }
  const oldRequired = new Set(old.input?.required ?? []);
  for (const field of now.input?.required ?? []) {
    if (!oldRequired.has(field)) breaks.push(`input field "${field}" is now required`);
  }
  if (!old.destructive && now.destructive) breaks.push('now requires confirmation');
  if (!old.systemOnly && now.systemOnly) breaks.push('now system-only');
  return breaks;
}

export function findBreaks(before, after) {
  const next = new Map(after.commands.map((c) => [c.name, c]));
  return before.commands.flatMap((old) => {
    const now = next.get(old.name);
    if (!now) return [`${old.name}: removed`];
    return breaksOf(old, now).map((b) => `${old.name}: ${b}`);
  });
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('check-contract-break.mjs')) {
  const base = arg('base');
  const labels = (arg('labels') ?? '').split(',');
  let before;
  try {
    before = JSON.parse(
      execFileSync('git', ['show', `${base}:commands.manifest.json`], { encoding: 'utf8' }),
    );
  } catch {
    console.log('No manifest on the base branch yet; nothing to compare.');
    process.exit(0);
  }
  const after = JSON.parse(readFileSync('commands.manifest.json', 'utf8'));
  const breaks = findBreaks(before, after);
  if (breaks.length === 0) {
    console.log('No breaking command changes.');
  } else if (labels.includes('breaking-contract')) {
    console.log(`Breaking changes acknowledged by label:\n  - ${breaks.join('\n  - ')}`);
  } else {
    console.error(
      `Breaking command changes need the breaking-contract label:\n  - ${breaks.join('\n  - ')}`,
    );
    process.exit(1);
  }
}
