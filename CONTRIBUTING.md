# Contributing

Guild members and their agents are welcome. New here? Read [SETUP.md](SETUP.md) and
[docs/architecture.md](docs/architecture.md) first. The short version:

1. **Pick or file an issue.** Use the issue forms; `agent-task` is for work an agent can take.
2. **Branch** from `main`: `feat/<scope>-<thing>`, `fix/...`, `chore/...`.
3. **Start from the command.** New behavior is a guild-kit command in a module, with tests
   against the module's memory store. UI comes last.
4. **New feature area?** Scaffold a module: `uv run --directory tooling/botcore vintagebot module-new <name>`.
   New ideas start at maturity `labs` (in `module.json`), feature-flagged off in production.
5. **Run `pnpm validate:final`** before opening a PR. CI runs the same gates. The **PR title**
   becomes the squash commit on `main`, so it follows the same Conventional Commits format
   (CI checks it).
6. **Commits** follow Conventional Commits with a scope from `commitlint.config.mjs`
   (`feat(identity): add character-update`) and are **signed off** (`git commit -s`), which
   is how you accept the [contributor agreement](CONTRIBUTOR_AGREEMENT.md). If an AI agent
   helped, say so with an `Assisted-by: <model>` trailer, not `Co-authored-by` (that would
   credit the agent instead of you).
7. **Update docs in the same PR**: the feature doc in `docs/features/`, the module `AGENTS.md`
   if conventions change, and `commands.manifest.json` if a command changed.

Ownership is listed in `.github/area-ownership.json`; CODEOWNERS is notification-only, so
reviews don't block on one person. The `ci-ok` check is what must pass.

By signing off, you license your contribution under the project license
([PolyForm Noncommercial 1.0.0](LICENSE.md)) and let the guild maintainers relicense it later;
see [CONTRIBUTOR_AGREEMENT.md](CONTRIBUTOR_AGREEMENT.md).

Found a bug in AFD, botcore, Mechanic, FenUI/FenCore, Violet, or FAST-AF? File it upstream
with the `upstream` issue form and link it (PLAN §7.5).
