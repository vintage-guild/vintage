#!/usr/bin/env node
// Compares commands.manifest.json against the base branch (PLAN §3.3). A removed command, a
// raised tier, a newly required input field, a removed input property, a removed enum value, an
// incompatible input type change, a new confirmation step, or a command that became system-only
// breaks callers (agents, CLI scripts, the addon), so it needs the `breaking-contract` label.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Keep in step with packages/guild-kit/src/tiers.ts.
const TIERS = ['public', 'friend', 'member', 'recruit', 'raider', 'leader', 'officer'];

function jsonTypeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function unionTypes(branches) {
  const union = new Set();
  for (const branch of branches) {
    const sub = typesOf(branch);
    if (!sub) return null;
    for (const t of sub) union.add(t);
  }
  return union;
}

/** Set of JSON Schema types accepted by `schema`, or null when unconstrained. */
function typesOf(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (typeof schema.type === 'string') return new Set([schema.type]);
  if (Array.isArray(schema.type)) return new Set(schema.type);
  if ('const' in schema) return new Set([jsonTypeOf(schema.const)]);
  if (Array.isArray(schema.enum)) return new Set(schema.enum.map(jsonTypeOf));
  const branches = schema.anyOf ?? schema.oneOf;
  return Array.isArray(branches) && branches.length > 0 ? unionTypes(branches) : null;
}

/** Finite allowed values for `schema` (enum/const/union of them), or null when unbounded. */
function finiteValues(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.enum)) return schema.enum;
  if ('const' in schema) return [schema.const];
  if (schema.type === 'null') return [null];
  const branches = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(branches) && branches.length > 0) {
    const out = [];
    for (const branch of branches) {
      const sub = finiteValues(branch);
      if (!sub) return null;
      out.push(...sub);
    }
    return out;
  }
  return null;
}

function typeBreaks(oldSchema, nowSchema, path) {
  const oldTypes = typesOf(oldSchema);
  const nowTypes = typesOf(nowSchema);
  if (!oldTypes || !nowTypes) return [];
  const compatible = [...oldTypes].every(
    (t) => nowTypes.has(t) || (t === 'integer' && nowTypes.has('number')),
  );
  if (compatible) return [];
  const label = path ? `input field "${path}"` : 'input';
  return [
    `${label} type changed (${[...oldTypes].sort().join('|')} → ${[...nowTypes].sort().join('|')})`,
  ];
}

function enumBreaks(oldSchema, nowSchema, path) {
  const oldValues = finiteValues(oldSchema);
  const nowValues = finiteValues(nowSchema);
  if (!oldValues || !nowValues) return [];
  const nextKeys = new Set(nowValues.map((v) => JSON.stringify(v)));
  const label = path ? `input field "${path}"` : 'input';
  const breaks = [];
  for (const value of oldValues) {
    if (!nextKeys.has(JSON.stringify(value))) {
      breaks.push(`${label} removed enum value ${JSON.stringify(value)}`);
    }
  }
  return breaks;
}

function fieldName(path, field) {
  return path ? `${path}.${field}` : field;
}

function requiredBreaks(oldSchema, nowSchema, path) {
  const oldRequired = new Set(oldSchema.required ?? []);
  return (nowSchema.required ?? [])
    .filter((field) => !oldRequired.has(field))
    .map((field) => `input field "${fieldName(path, field)}" is now required`);
}

function propertyBreaks(oldSchema, nowSchema, path) {
  const oldProps = oldSchema.properties ?? {};
  const nowProps = nowSchema.properties ?? {};
  const breaks = [];
  for (const [field, oldProp] of Object.entries(oldProps)) {
    const fieldPath = fieldName(path, field);
    if (!(field in nowProps)) {
      breaks.push(`input field "${fieldPath}" was removed`);
    } else {
      breaks.push(...schemaBreaks(oldProp, nowProps[field], fieldPath));
    }
  }
  return breaks;
}

function objectBreaks(oldSchema, nowSchema, path) {
  return [
    ...requiredBreaks(oldSchema, nowSchema, path),
    ...propertyBreaks(oldSchema, nowSchema, path),
  ];
}

function schemaBreaks(oldSchema, nowSchema, path = '') {
  if (!oldSchema || !nowSchema || typeof oldSchema !== 'object' || typeof nowSchema !== 'object') {
    return [];
  }
  const breaks = [
    ...typeBreaks(oldSchema, nowSchema, path),
    ...enumBreaks(oldSchema, nowSchema, path),
    ...objectBreaks(oldSchema, nowSchema, path),
  ];
  if (
    oldSchema.items &&
    nowSchema.items &&
    !Array.isArray(oldSchema.items) &&
    !Array.isArray(nowSchema.items)
  ) {
    breaks.push(...schemaBreaks(oldSchema.items, nowSchema.items, `${path}[]`));
  }
  return breaks;
}

/** How one command that still exists breaks its callers, if it does. */
function breaksOf(old, now) {
  const breaks = [];
  if (TIERS.indexOf(now.tier) > TIERS.indexOf(old.tier)) {
    breaks.push(`tier raised ${old.tier} → ${now.tier}`);
  }
  breaks.push(...schemaBreaks(old.input, now.input));
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
