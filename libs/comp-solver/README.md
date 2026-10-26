# @vintage/comp-solver

Pure raid-composition scoring (PLAN §3.3, §6). Given signups, a raid size, and a template,
`solveComp` returns the selected roster, the bench, and the gaps, each with a short English
reason. No I/O; the `comp-suggest` command in `modules/raids` maps its signups onto
`CompSignup` and calls it.

```ts
import { defaultTemplate, solveComp } from '@vintage/comp-solver';

const result = solveComp({ raidSize: 10, template: defaultTemplate(10), signups });
result.gaps.map((g) => g.reason); // ['need 1 healer', 'no Mark of the Wild']
```

## How it picks

Signups are ranked by status (accepted, late, tentative, bench), then `priority` (higher
first), then `signedUpAt` (earlier first), then name, then id. Declined signups and specs that
don't belong to the class go to `excluded`. Then, best-ranked first:

1. **Requirements**, in template order: a provider (e.g. a druid for Mark of the Wild) is picked
   only while their role is under target, so a requirement never overfills a role. Otherwise
   it stays a gap.
2. **Role targets**: tank, healer, dps (melee + ranged) up to their targets.
3. **Open slots** up to the raid size, from whoever's left. Only here can a role go over target,
   which means nobody signed up for the roles still short.

Everyone else is benched, best-ranked first. Gaps are role shortfalls, unmet requirements, and
open slots the role gaps don't already explain.

## Guarantees (property-tested)

- Never more than the raid size; requirement and role picks never exceed a role target.
- A role goes over target only when no benched signup could fill a short role.
- Selected + bench = eligible signups, each exactly once.
- The same signups in any order give the same result.

`solveComp` throws a `RangeError` when role targets exceed the raid size or signup ids repeat;
parse with `compInputSchema` first to get those as input errors.
