#!/usr/bin/env node
// Decides which CI lanes a change owes (PLAN §7.2). Pure `selectCi` + a small CLI.
// Shape follows Lushly's scripts/ci-selection.mjs: flags + reasons, written to GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

export const LANES = ['ts', 'contract', 'addon', 'botcore', 'workflowContracts'];

const DOCS =
  /^(docs\/|PLAN\.md$|README\.md$|INIT\.md$|CONTRIBUTING\.md$|.*\/AGENTS\.md$|AGENTS\.md$|\.claude\/)/;
// scripts/*.mjs owe ts: it lints them and runs the check-* gates against the repo. Tooling config
// (Node version, hooks, commit rules) owes it too, or a bump is only tested after merge.
const TS =
  /^(apps|modules|packages|libs|vendor)\/|^scripts\/.*\.mjs$|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|tsconfig\.base\.json|biome\.json|vitest\.config\.ts|\.nvmrc|\.npmrc|lefthook\.yml|commitlint\.config\.mjs)$/;
// Any module or lib source: command inputs import schemas from domain files and libs
// (wow-data's classSchema, raids' groupSizeSchema), so a change there can break the manifest.
const CONTRACT =
  /^(modules\/[^/]+\/src\/|libs\/[^/]+\/src\/|packages\/guild-kit\/|apps\/api\/src\/registry|commands\.manifest\.json$|scripts\/check-contract-break\.mjs$)/;
const ADDON = /^(addon\/|libs\/bridge-format\/)/;
const BOTCORE = /^(tooling\/botcore\/|botcore\.toml$)/;
const WORKFLOW = /^(\.github\/|scripts\/)/;

/**
 * @param {{ eventName: string, paths: string[], labels?: string[] }} input
 * @returns {{ docsOnly: boolean, fullValidation: boolean, reasons: Record<string, string[]> } & Record<string, boolean>}
 */
export function selectCi({ eventName, paths, labels = [] }) {
  const fullReasons = [];
  if (labels.includes('ci:full-validation')) fullReasons.push('label ci:full-validation');
  if (eventName === 'schedule' || eventName === 'workflow_dispatch') fullReasons.push(eventName);
  if (eventName === 'push') fullReasons.push('push to main');
  const fullValidation = fullReasons.length > 0;

  const docsOnly = paths.length > 0 && paths.every((p) => DOCS.test(p)) && !fullValidation;
  const reasons = { fullValidation: fullReasons };
  const pick = (lane, re) => {
    reasons[lane] = paths.filter((p) => re.test(p));
    return fullValidation || (!docsOnly && reasons[lane].length > 0);
  };

  return {
    docsOnly,
    fullValidation,
    ts: pick('ts', TS),
    contract: pick('contract', CONTRACT),
    addon: pick('addon', ADDON),
    botcore: pick('botcore', BOTCORE),
    workflowContracts: pick('workflowContracts', WORKFLOW),
    reasons,
  };
}

function changedPaths(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('ci-selection.mjs')) {
  const eventName = arg('event') ?? 'pull_request';
  const labels = (arg('labels') ?? '').split(',').filter(Boolean);
  const paths =
    eventName === 'pull_request' ? changedPaths(arg('base'), arg('head') ?? 'HEAD') : [];
  const selection = selectCi({ eventName, paths, labels });
  const output = arg('output');
  if (output)
    writeFileSync(
      output,
      JSON.stringify({ schemaVersion: 1, eventName, paths, ...selection }, null, 2),
    );
  const gh = arg('github-output');
  if (gh) {
    const flags = ['docsOnly', 'fullValidation', ...LANES];
    appendFileSync(gh, flags.map((k) => `${k}=${selection[k]}\n`).join(''));
  }
  console.log(JSON.stringify(selection, null, 2));
}
