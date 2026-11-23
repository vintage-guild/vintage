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
const interactionsFn = join(out, 'functions', 'api', 'discord', 'interactions.func');
const mcpFn = join(out, 'functions', 'api', 'mcp.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(interactionsFn, { recursive: true });
mkdirSync(mcpFn, { recursive: true });

const vcConfig = `${JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs' }, null, 2)}\n`;

await Promise.all([
  build({
    entryPoints: [join(root, 'src', 'vercel.ts')],
    outfile: join(interactionsFn, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'warning',
  }),
  build({
    entryPoints: [join(root, 'src', 'vercel-mcp.ts')],
    outfile: join(mcpFn, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'warning',
  }),
]);
writeFileSync(join(interactionsFn, '.vc-config.json'), vcConfig);
writeFileSync(join(mcpFn, '.vc-config.json'), vcConfig);
writeFileSync(
  join(out, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/discord/interactions/?$', dest: '/api/discord/interactions' },
        // /mcp's protected-resource metadata (RFC 9728), at the root and path-inserted for /mcp.
        {
          src: '^/\\.well-known/oauth-protected-resource(/mcp)?/?$',
          dest: '/api/mcp',
        },
        { src: '^/mcp/?$', dest: '/api/mcp' },
      ],
    },
    null,
    2,
  )}\n`,
);
cpSync(join(root, 'public'), join(out, 'static'), { recursive: true });
console.log(
  'Built .vercel/output (functions: /api/discord/interactions, /api/mcp; routes: /discord/interactions, /mcp, /.well-known/oauth-protected-resource)',
);
