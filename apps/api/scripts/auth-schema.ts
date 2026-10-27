// Regenerate convex/betterAuth/schema.ts from the Better Auth options in convex/auth.ts.
//
//   pnpm --filter @vintage/api auth:schema
//
// Run it after any options change that adds or changes tables, such as a new plugin. It calls the
// same generator `npx auth generate` uses, without installing the CLI. Never edit schema.ts by
// hand: table and field names come from Better Auth.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthTables } from 'better-auth/db';
import { createAuthOptions } from '../convex/auth';

const componentDir = fileURLToPath(new URL('../convex/betterAuth', import.meta.url));
// The generator expects to run inside the component directory.
process.chdir(componentDir);

// Options only, never a live auth instance: no environment or Convex context is needed.
// biome-ignore lint/suspicious/noExplicitAny: schema generation runs without a Convex ctx.
const options = createAuthOptions({} as any);
// biome-ignore lint/suspicious/noExplicitAny: the adapter factory's types don't expose createSchema.
const adapter = (options.database as any)(options);
const { code } = await adapter.createSchema({ file: 'schema.ts', tables: getAuthTables(options) });
writeFileSync(join(componentDir, 'schema.ts'), code);
console.log('wrote convex/betterAuth/schema.ts');
