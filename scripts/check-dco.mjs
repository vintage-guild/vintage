#!/usr/bin/env node
// Every human commit in a pull request must carry a `Signed-off-by:` line matching its author:
// that is how contributors accept CONTRIBUTOR_AGREEMENT.md. Bot commits (Dependabot etc.) are exempt.
// AI agents must not be credited as co-authors (GitHub counts that as authorship); they are
// disclosed with an `Assisted-by:` trailer instead (AGENTS.md).
import { execFileSync } from 'node:child_process';

const SEP = '\u001e';
const FIELD = '\u001f';

/** Fully automated commits: authored by a bot account (Dependabot, an agent's own bot user). */
const isBot = (c) =>
  /\[bot\]$/.test(c.author) || /\[bot\]@users\.noreply\.github\.com$/.test(c.email);

/** @param {{ sha: string, author: string, email: string, body: string }[]} commits */
export function findUnsigned(commits) {
  return commits.filter((c) => {
    if (isBot(c)) return false;
    const signoffs = [...c.body.matchAll(/^Signed-off-by:\s*(.+?)\s*<([^>]+)>\s*$/gim)];
    return !signoffs.some(([, , email]) => email.toLowerCase() === c.email.toLowerCase());
  });
}

const AGENT_EMAILS = [/@anthropic\.com$/i, /@openai\.com$/i, /copilot/i, /\[bot\]@/i];

/**
 * Human-driven commits that credit an AI agent with `Co-authored-by` instead of `Assisted-by`.
 * Fully automated (bot-authored) commits may credit agents.
 */
export function findAgentCoauthors(commits) {
  return commits.filter(
    (c) =>
      !isBot(c) &&
      [...c.body.matchAll(/^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim)].some(([, , email]) =>
        AGENT_EMAILS.some((re) => re.test(email)),
      ),
  );
}

function commitsBetween(base, head) {
  const out = execFileSync(
    'git',
    ['log', '--no-merges', `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%B${SEP}`, `${base}..${head}`],
    { encoding: 'utf8' },
  );
  return out
    .split(SEP)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, author, email, body] = r.split(FIELD);
      return { sha, author, email, body };
    });
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('check-dco.mjs')) {
  const commits = commitsBetween(arg('base'), arg('head') ?? 'HEAD');
  const coauthored = findAgentCoauthors(commits);
  if (coauthored.length) {
    console.error(
      'Commits crediting an AI agent as co-author (use an Assisted-by: trailer instead):',
    );
    for (const c of coauthored) console.error(`  - ${c.sha.slice(0, 7)} ${c.author}`);
  }
  const unsigned = findUnsigned(commits);
  if (unsigned.length) {
    console.error('Commits missing a matching Signed-off-by line (see CONTRIBUTOR_AGREEMENT.md):');
    for (const c of unsigned) console.error(`  - ${c.sha.slice(0, 7)} ${c.author} <${c.email}>`);
    console.error('Fix: git rebase --signoff <base> && git push --force-with-lease');
  }
  if (unsigned.length || coauthored.length) process.exit(1);
  console.log('All commits signed off by their human authors.');
}
