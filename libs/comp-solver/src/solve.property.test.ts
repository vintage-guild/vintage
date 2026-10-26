import { CLASS_NAMES, CLASSES, roleFor, type WowClass } from '@vintage/wow-data';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMP_ROLES,
  type CompInput,
  type CompSignup,
  compareSignups,
  compRoleOf,
  RAID_SIZES,
  REQUIREMENTS,
  SIGNUP_STATUSES,
  solveComp,
} from './index';

const signupArb = (id: number): fc.Arbitrary<CompSignup> =>
  fc
    .record({
      class: fc.constantFrom(...CLASS_NAMES),
      specIndex: fc.nat(),
      status: fc.constantFrom(...SIGNUP_STATUSES),
      priority: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
      signedUpAt: fc.integer({ min: 0, max: 20 }),
      name: fc.constantFrom('Aeryn', 'Bram', 'Cael', 'Dara', 'Eli'),
    })
    .map(({ specIndex, priority, ...s }): CompSignup => {
      const specs = Object.keys(CLASSES[s.class as WowClass]);
      const spec = specs[specIndex % specs.length] ?? 'unknown';
      return { id: `s${id}`, spec, ...s, ...(priority === undefined ? {} : { priority }) };
    });

const inputArb: fc.Arbitrary<CompInput> = fc
  .record({
    raidSize: fc.constantFrom(...RAID_SIZES),
    split: fc.tuple(fc.nat(), fc.nat(), fc.nat()),
    reqs: fc.subarray(Object.values(REQUIREMENTS)),
    count: fc.integer({ min: 0, max: 60 }),
  })
  .chain(({ raidSize, split: [a, b, c], reqs, count }) => {
    // Role targets that never exceed the raid size, sometimes leaving open slots.
    const tank = a % (raidSize + 1);
    const healer = b % (raidSize - tank + 1);
    const dps = c % (raidSize - tank - healer + 1);
    return fc.tuple(...Array.from({ length: count }, (_, i) => signupArb(i))).map((signups) => ({
      raidSize,
      template: { targets: { tank, healer, dps }, requirements: reqs },
      signups,
    }));
  });

const eligibleIds = (input: CompInput) =>
  input.signups
    .filter((s) => s.status !== 'declined' && roleFor(s.class, s.spec) !== undefined)
    .map((s) => s.id);

describe('solveComp properties', () => {
  it('never selects more than the raid size', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(solveComp(input).selected.length).toBeLessThanOrEqual(input.raidSize);
      }),
    );
  });

  it('puts every eligible signup in exactly one of selected or bench', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        const placed = [...result.selected, ...result.bench].map((d) => d.signup.id);
        expect(new Set(placed).size).toBe(placed.length);
        expect([...placed].sort()).toEqual(eligibleIds(input).sort());
        expect(result.selected.length + result.bench.length + result.excluded.length).toBe(
          input.signups.length,
        );
      }),
    );
  });

  it('goes over a role target only when no benched signup could fill a short role', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        const { targets } = input.template;
        const short = COMP_ROLES.filter((r) => result.counts[r] < targets[r]);
        const over = COMP_ROLES.filter((r) => result.counts[r] > targets[r]);
        if (over.length === 0) return;
        const benchedShort = result.bench.filter((d) => short.includes(compRoleOf(d.role)));
        expect(benchedShort).toEqual([]);
      }),
    );
  });

  it('keeps requirement and role picks within each role target', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        for (const role of COMP_ROLES) {
          const targeted = result.selected.filter(
            (d) => d.code !== 'fill' && compRoleOf(d.role) === role,
          );
          expect(targeted.length).toBeLessThanOrEqual(input.template.targets[role]);
        }
      }),
    );
  });

  it('gives open slots to the best-ranked leftovers', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        for (const fill of result.selected.filter((d) => d.code === 'fill')) {
          for (const benched of result.bench)
            expect(compareSignups(fill.signup, benched.signup)).toBeLessThan(0);
        }
      }),
    );
  });

  it('benches nobody while the raid has open slots', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        if (result.selected.length < input.raidSize) expect(result.bench).toEqual([]);
      }),
    );
  });

  it('fills every role target the signups can cover', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        for (const role of COMP_ROLES) {
          if (result.counts[role] < input.template.targets[role]) {
            expect(result.bench.filter((d) => compRoleOf(d.role) === role)).toEqual([]);
          }
        }
      }),
    );
  });

  it('gives the same result for the same signups in any order', () => {
    fc.assert(
      fc.property(
        inputArb.chain((input) =>
          fc.tuple(
            fc.constant(input),
            fc.shuffledSubarray(input.signups, { minLength: input.signups.length }),
          ),
        ),
        ([input, shuffled]) => {
          expect(solveComp({ ...input, signups: shuffled })).toEqual(solveComp(input));
        },
      ),
    );
  });

  it('keeps counts and gaps consistent with the selection', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = solveComp(input);
        const byRole = (r: string) =>
          result.selected.filter((d) => compRoleOf(d.role) === r).length;
        for (const role of COMP_ROLES) expect(result.counts[role]).toBe(byRole(role));
        for (const gap of result.gaps) {
          expect(gap.missing).toBeGreaterThan(0);
          expect(gap.reason.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
