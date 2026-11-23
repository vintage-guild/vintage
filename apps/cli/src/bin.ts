#!/usr/bin/env node
// Vintage CLI (#9): thin wrapper over @lushly-dev/afd-cli pointed at /mcp with Streamable HTTP.
import { createCli } from '@lushly-dev/afd-cli';
import { prepareCliInvocation } from './args';

const prepared = prepareCliInvocation(process.argv.slice(2), process.env);
if (prepared.afdHeaders) {
  process.env.AFD_HEADERS = prepared.afdHeaders;
}

const program = createCli();
program
  .name('vintage')
  .description(
    'Vintage guild CLI — afd-cli configured with --transport streamable-http against /mcp',
  );

await program.parseAsync([
  process.argv[0] ?? 'node',
  process.argv[1] ?? 'vintage',
  ...prepared.args,
]);
