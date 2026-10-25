// Writes or checks commands.manifest.json at the repo root (PLAN §3.3, contract lane in CI).
//   tsx scripts/command-manifest.ts --write   regenerate after changing a command
//   tsx scripts/command-manifest.ts --check   fail if the committed manifest is stale
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toManifest } from '@vintage/guild-kit';
import { commands } from '../src/registry';

const path = fileURLToPath(new URL('../../../commands.manifest.json', import.meta.url));
const next = `${JSON.stringify(toManifest(commands), null, 2)}\n`;

if (process.argv.includes('--write')) {
  writeFileSync(path, next);
  console.log(`Wrote ${commands.length} commands to commands.manifest.json`);
} else {
  const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== next) {
    console.error(
      'commands.manifest.json is stale. Run `pnpm manifest:write` and commit the result.',
    );
    console.error(
      'If a command name, tier, or schema changed incompatibly, label the PR `breaking-contract`.',
    );
    process.exit(1);
  }
  console.log(`Command manifest up to date (${commands.length} commands).`);
}
