## What

## Why

## How

## Testing

- [ ] Every commit is signed off (`git commit -s`, see CONTRIBUTOR_AGREEMENT.md)
- [ ] `pnpm validate:final` passes
- [ ] New behavior is tested through `registry.execute` (commands) or the gate was watched failing (gates)

## Review

<!-- From the vintage-review skill. Example:
- Lanes: correctness, command contract, tests (self, EXECUTION: available)
- Not owed: security, addon (no auth, Discord, MCP, or addon change)
- Findings: 2 fixed in PR · 1 follow-up (#NN) · 1 no action
- Passes: 2
-->

- Lanes:
- Not owed:
- Findings:
- Passes:

## Checklist

- [ ] Self-review done and recorded above (`vintage-review` skill)
- [ ] Feature doc in `docs/features/` updated in this PR
- [ ] `commands.manifest.json` regenerated if a command changed (`pnpm manifest:write`)
- [ ] `breaking-contract` label added if a command was removed, a tier raised, a required input added, or a command made destructive
- [ ] Upstream issues linked for any workaround (AFD, botcore, Mechanic, FenUI/FenCore, Violet, FAST-AF)
