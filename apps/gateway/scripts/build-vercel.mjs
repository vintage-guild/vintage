#!/usr/bin/env node
// Build the gateway for Vercel with the Build Output API (https://vercel.com/docs/build-output-api):
// esbuild bundles src/vercel.ts and its workspace packages into one self-contained module, so
// nothing has to be resolved at runtime. Vercel runs this as the project's build command
// (vercel.json) and deploys .vercel/output as-is.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api', 'discord', 'interactions.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'warning',
});
writeFileSync(
  join(fn, '.vc-config.json'),
  `${JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs' }, null, 2)}\n`,
);
writeFileSync(
  join(out, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [{ src: '^/discord/interactions/?$', dest: '/api/discord/interactions' }],
    },
    null,
    2,
  )}\n`,
);
cpSync(join(root, 'public'), join(out, 'static'), { recursive: true });
console.log(
  'Built .vercel/output (function: /api/discord/interactions, also /discord/interactions)',
);
