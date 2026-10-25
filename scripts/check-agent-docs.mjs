#!/usr/bin/env node
// AGENTS.md routes rather than explains (PLAN §7.4). This keeps it lean and its links live:
//   - AGENTS.md stays under the line budget
//   - every relative markdown link in AGENTS.md / INIT.md resolves
//   - every skill named as `vintage-*` in AGENTS.md exists in .claude/skills
//   - every module has its own AGENTS.md
//   - every .claude/skills/vintage-* skill is listed in AGENTS.md
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, rel, workspacePackages } from './lib/workspace.mjs';

const AGENTS_MAX_LINES = 200;

function checkBudget(agents) {
  const lines = agents.split('\n').length;
  return lines > AGENTS_MAX_LINES
    ? [`AGENTS.md has ${lines} lines (max ${AGENTS_MAX_LINES}); move detail into a skill`]
    : [];
}

function checkLinks(root, doc) {
  const path = join(root, doc);
  if (!existsSync(path)) return [`${doc} is missing`];
  const text = readFileSync(path, 'utf8');
  return [...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
    .map(([, target]) => target)
    .filter((target) => !/^[a-z]+:/i.test(target) && !existsSync(join(dirname(path), target)))
    .map((target) => `${doc}: broken link → ${target}`);
}

function checkNamedSkills(root, agents) {
  return [...agents.matchAll(/`(vintage-[a-z0-9-]+)`/g)]
    .map(([, skill]) => skill)
    .filter((skill) => !existsSync(join(root, '.claude', 'skills', skill, 'SKILL.md')))
    .map(
      (skill) => `AGENTS.md names skill "${skill}" but .claude/skills/${skill}/SKILL.md is missing`,
    );
}

/** Every project skill must be routed from AGENTS.md, or agents never find it. */
function checkSkillsRouted(root, agents) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith('vintage-') && existsSync(join(dir, name, 'SKILL.md')))
    .filter((name) => !agents.includes(`\`${name}\``))
    .map((name) => `.claude/skills/${name} is not listed in AGENTS.md's Skills table`);
}

function checkModuleDocs(root) {
  return workspacePackages(root)
    .filter((p) => p.layer === 'modules' && !existsSync(join(p.dir, 'AGENTS.md')))
    .map((p) => `${rel(p.dir, root)}/AGENTS.md is missing`);
}

export function checkAgentDocs(root = ROOT) {
  const agentsPath = join(root, 'AGENTS.md');
  if (!existsSync(agentsPath)) return ['AGENTS.md is missing'];
  const agents = readFileSync(agentsPath, 'utf8');
  return [
    ...checkBudget(agents),
    ...checkLinks(root, 'AGENTS.md'),
    ...checkLinks(root, 'INIT.md'),
    ...checkNamedSkills(root, agents),
    ...checkSkillsRouted(root, agents),
    ...checkModuleDocs(root),
  ];
}

if (process.argv[1]?.endsWith('check-agent-docs.mjs')) {
  const errors = checkAgentDocs();
  if (errors.length) {
    console.error(`Agent docs check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Agent docs check passed.');
}
