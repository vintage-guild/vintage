import { describe, expect, it } from 'vitest';
import {
  type CompSignup,
  compInputSchema,
  defaultTemplate,
  inputIssues,
  REQUIREMENTS,
  solveComp,
} from './index';

let clock = 0;
function su(
  name: string,
  cls: CompSignup['class'],
  spec: string,
  extra: Partial<CompSignup> = {},
): CompSignup {
  clock += 1;
  return {
    id: name.toLowerCase(),
    name,
    class: cls,
    spec,
    status: 'accepted',
    signedUpAt: clock,
    ...extra,
  };
}

const NO_REQS = { tank: 2, healer: 3, dps: 5 };

describe('solveComp', () => {
  it('fills a 10-man to its role targets and benches the rest', () => {
    const signups = [
      su('Tankone', 'warrior', 'protection'),
      su('Tanktwo', 'paladin', 'protection'),
      su('Healone', 'priest', 'holy'),
      su('Healtwo', 'paladin', 'holy'),
      su('Healthree', 'shaman', 'restoration'),
      su('Healfour', 'priest', 'discipline'),
      su('Dpsone', 'mage', 'frost'),
      su('Dpstwo', 'rogue', 'combat'),
      su('Dpsthree', 'warlock', 'affliction'),
      su('Dpsfour', 'hunter', 'marksmanship'),
      su('Dpsfive', 'warrior', 'fury'),
    ];
    const result = solveComp({ raidSize: 10, template: { targets: NO_REQS }, signups });

    expect(result.counts).toMatchObject({
      selected: 10,
      tank: 2,
      healer: 3,
      dps: 5,
      confirmed: 10,
    });
    expect(result.bench.map((b) => b.signup.name)).toEqual(['Healfour']);
    expect(result.bench[0]).toMatchObject({ code: 'role-full', reason: 'healer slots full (3/3)' });
    expect(result.gaps).toEqual([]);
    expect(result.selected.map((d) => d.signup.name).slice(0, 3)).toEqual([
      'Tankone',
      'Tanktwo',
      'Healone',
    ]);
    expect(result.selected[2]).toMatchObject({ code: 'role', reason: 'healer 1 of 3' });
  });

  it('reports the gaps the officer digest shows', () => {
    const signups = [
      su('Tankone', 'warrior', 'protection'),
      su('Tanktwo', 'warrior', 'protection'),
      su('Healone', 'priest', 'holy'),
      su('Healtwo', 'shaman', 'restoration'),
      su('Dpsone', 'mage', 'frost'),
      su('Dpstwo', 'rogue', 'combat'),
      su('Dpsthree', 'warlock', 'affliction'),
      su('Dpsfour', 'hunter', 'marksmanship'),
    ];
    const template = { targets: NO_REQS, requirements: [REQUIREMENTS['mark-of-the-wild']] };
    const result = solveComp({ raidSize: 10, template, signups });

    expect(result.gaps.map((g) => g.reason)).toEqual([
      'need 1 healer',
      'need 1 dps',
      'no Mark of the Wild',
    ]);
    expect(result.gaps[0]).toEqual({
      kind: 'role',
      role: 'healer',
      target: 3,
      have: 2,
      missing: 1,
      reason: 'need 1 healer',
    });
    expect(result.counts.selected).toBe(8);
  });

  it('takes a requirement provider over a higher-ranked player in the same role', () => {
    const signups = [
      su('Healone', 'priest', 'holy', { priority: 5 }),
      su('Healtwo', 'priest', 'holy', { priority: 5 }),
      su('Druid', 'druid', 'restoration', { priority: 1 }),
    ];
    const template = {
      targets: { tank: 0, healer: 2, dps: 0 },
      requirements: [REQUIREMENTS['mark-of-the-wild']],
    };
    const result = solveComp({ raidSize: 10, template, signups });

    // Targets sum to 2 of 10, so open slots take the second priest too.
    expect(result.selected.find((d) => d.signup.name === 'Druid')).toMatchObject({
      code: 'requirement',
      reason: 'provides Mark of the Wild',
    });
    expect(result.selected.find((d) => d.signup.name === 'Healtwo')).toMatchObject({
      code: 'fill',
    });
    expect(result.gaps).toEqual([
      { kind: 'size', raidSize: 10, have: 3, missing: 7, reason: 'need 7 more players' },
    ]);
  });

  it('matches requirement providers by spec when given', () => {
    const resto = {
      id: 'resto-shaman',
      label: 'resto shaman',
      providers: [{ class: 'shaman' as const, spec: 'restoration' }],
    };
    const template = { targets: { tank: 0, healer: 1, dps: 1 }, requirements: [resto] };
    const enh = solveComp({
      raidSize: 10,
      template,
      signups: [su('Enh', 'shaman', 'enhancement')],
    });
    expect(enh.gaps.map((g) => g.reason)).toContain('no resto shaman');

    const rs = solveComp({
      raidSize: 10,
      template,
      signups: [su('Resto', 'shaman', 'restoration')],
    });
    expect(rs.gaps.map((g) => g.kind)).not.toContain('requirement');
  });

  it('leaves a requirement as a gap rather than overfill a full role', () => {
    const mages = Array.from({ length: 10 }, (_, i) =>
      su(`Mage${String.fromCharCode(65 + i)}`, 'mage', 'frost'),
    );
    const template = {
      targets: { tank: 0, healer: 0, dps: 10 },
      requirements: [REQUIREMENTS['mark-of-the-wild']],
    };
    const result = solveComp({
      raidSize: 10,
      template,
      signups: [...mages, su('Druid', 'druid', 'restoration')],
    });

    expect(result.counts.selected).toBe(10);
    expect(result.bench.map((b) => [b.signup.name, b.reason])).toEqual([
      ['Druid', 'healer slots full (0/0)'],
    ]);
    expect(result.gaps.map((g) => g.reason)).toEqual(['no Mark of the Wild']);
  });

  it('says how many more providers a counted requirement needs', () => {
    const twoDruids = { ...REQUIREMENTS['mark-of-the-wild'], count: 2 };
    const template = { targets: { tank: 0, healer: 2, dps: 0 }, requirements: [twoDruids] };
    const result = solveComp({
      raidSize: 10,
      template,
      signups: [su('Druid', 'druid', 'restoration')],
    });
    expect(result.gaps.find((g) => g.kind === 'requirement')?.reason).toBe(
      'need 1 more Mark of the Wild',
    );
  });

  it('ranks accepted over late over tentative over bench, then priority, time, name', () => {
    const t = { targets: { tank: 0, healer: 0, dps: 1 } };
    // With only one dps target and 10 slots, everyone gets in; rank order shows in the dps slot.
    const dpsSlot = (signups: CompSignup[]) =>
      solveComp({ raidSize: 10, template: t, signups }).selected.find((d) => d.code === 'role')
        ?.signup.name;

    expect(
      dpsSlot([su('Late', 'mage', 'frost', { status: 'late' }), su('Yes', 'mage', 'frost')]),
    ).toBe('Yes');
    expect(
      dpsSlot([
        su('Maybe', 'mage', 'frost', { status: 'tentative' }),
        su('Late', 'mage', 'frost', { status: 'late' }),
      ]),
    ).toBe('Late');
    expect(
      dpsSlot([
        su('Sit', 'mage', 'frost', { status: 'bench' }),
        su('Maybe', 'mage', 'frost', { status: 'tentative' }),
      ]),
    ).toBe('Maybe');
    expect(
      dpsSlot([
        su('Flex', 'mage', 'frost', { priority: 1 }),
        su('Raider', 'mage', 'frost', { priority: 2 }),
      ]),
    ).toBe('Raider');
    expect(
      dpsSlot([
        su('Early', 'mage', 'frost', { signedUpAt: 1 }),
        su('Later', 'mage', 'frost', { signedUpAt: 2 }),
      ]),
    ).toBe('Early');
    expect(
      dpsSlot([
        su('Bee', 'mage', 'frost', { id: 'b', signedUpAt: 1 }),
        su('Ann', 'mage', 'frost', { id: 'a', signedUpAt: 1 }),
      ]),
    ).toBe('Ann');
  });

  it('fills open slots past a role target only when the short role has nobody', () => {
    const signups = [
      su('Tankone', 'warrior', 'protection'),
      su('Tanktwo', 'warrior', 'protection'),
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((n) => su(`Mage${n}`, 'mage', 'frost')),
    ];
    const result = solveComp({ raidSize: 10, template: { targets: NO_REQS }, signups });

    expect(result.counts).toMatchObject({ selected: 10, tank: 2, healer: 0, dps: 8 });
    const fills = result.selected.filter((d) => d.code === 'fill');
    expect(fills).toHaveLength(3);
    expect(fills[0]?.reason).toBe('open slot: no healer available');
    expect(result.bench).toHaveLength(1);
    expect(result.bench[0]).toMatchObject({ code: 'raid-full', reason: 'raid full (10/10)' });
    expect(result.gaps.map((g) => g.reason)).toEqual(['need 3 healers']);
  });

  it('excludes declines and specs that are not the class', () => {
    const result = solveComp({
      raidSize: 10,
      template: { targets: NO_REQS },
      signups: [su('No', 'mage', 'frost', { status: 'declined' }), su('Odd', 'mage', 'holy')],
    });
    expect(result.excluded.map((e) => [e.signup.name, e.code, e.reason])).toEqual([
      ['Odd', 'unknown-role', 'holy is not a mage spec'],
      ['No', 'declined', 'declined'],
    ]);
    expect(result.selected).toEqual([]);
    expect(result.bench).toEqual([]);
  });

  it('uses an explicit role over the spec default', () => {
    const result = solveComp({
      raidSize: 10,
      template: { targets: { tank: 1, healer: 0, dps: 0 } },
      signups: [su('Bear', 'druid', 'feral', { role: 'tank' })],
    });
    expect(result.selected[0]).toMatchObject({ role: 'tank', code: 'role' });
  });

  it('marks volunteers for the bench in the reason', () => {
    const result = solveComp({
      raidSize: 10,
      template: { targets: { tank: 0, healer: 0, dps: 10 } },
      signups: [
        ...Array.from({ length: 10 }, (_, i) =>
          su(`Mage${String.fromCharCode(65 + i)}`, 'mage', 'frost'),
        ),
        su('Sitter', 'rogue', 'combat', { status: 'bench' }),
      ],
    });
    expect(result.bench[0]?.reason).toBe('signed up as bench; dps slots full (10/10)');
  });

  it('rejects targets over the raid size and duplicate ids', () => {
    const bad = {
      raidSize: 10 as const,
      template: { targets: { tank: 4, healer: 4, dps: 4 } },
      signups: [su('Same', 'mage', 'frost'), su('Same', 'mage', 'fire')],
    };
    expect(inputIssues(bad)).toEqual([
      'role targets (12) exceed the raid size (10)',
      'duplicate signup id: same',
    ]);
    expect(() => solveComp(bad)).toThrow(RangeError);
    expect(compInputSchema.safeParse(bad).success).toBe(false);
  });

  it('ships default templates that fit their raid size', () => {
    for (const raidSize of [10, 20, 40] as const) {
      const template = defaultTemplate(raidSize);
      expect(compInputSchema.safeParse({ raidSize, template, signups: [] }).success).toBe(true);
      const { tank, healer, dps } = template.targets;
      expect(tank + healer + dps).toBe(raidSize);
    }
  });
});
