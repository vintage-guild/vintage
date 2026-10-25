## What

## Why

## How

## Testing

- [ ] Every commit is signed off (`git commit -s`, see CONTRIBUTOR_AGREEMENT.md)
- [ ] `pnpm validate:final` passes
- [ ] New behavior is tested through `registry.execute` (commands) or the gate was watched failing (gates)

## Checklist

- [ ] Feature doc in `docs/features/` updated in this PR
- [ ] `commands.manifest.json` regenerated if a command changed (`pnpm manifest:write`)
- [ ] `breaking-contract` label added if a command was removed, a tier raised, or a required input added
- [ ] Upstream issues linked for any workaround (AFD, botcore, Mechanic, FenUI/FenCore, Violet, FAST-AF)
