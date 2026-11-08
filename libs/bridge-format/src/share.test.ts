import { describe, expect, it } from 'vitest';
import { decodeRaidImport, decodeRaidShare, encodeBridge } from './bridge';
import { FIXTURES } from './fixtures';
import { type RaidImport, raidShareV1Schema } from './schemas';
import { raidShareFromImport } from './share';

const withBench = FIXTURES['raid-import-bench.v1']?.payload as unknown as RaidImport;
const withoutBench = FIXTURES['raid-import.v1']?.payload as unknown as RaidImport;

describe('raidShareFromImport', () => {
  it('keeps the raid, roster, groups, loot, and candidates as the import has them', () => {
    const share = raidShareFromImport(withBench);
    expect(share).toMatchObject({
      v: 1,
      kind: 'raid-share',
      guildId: withBench.guildId,
      generatedAt: withBench.generatedAt,
      raid: withBench.raid,
      roster: withBench.roster,
      groups: withBench.groups,
      loot: withBench.loot,
      candidates: withBench.candidates,
    });
  });

  it('keeps who is on the bench, in order, without why', () => {
    const share = raidShareFromImport(withBench);
    expect(share.bench?.map((b) => b.characterId)).toEqual(
      withBench.bench?.map((b) => b.characterId),
    );
    for (const entry of share.bench ?? []) {
      expect(entry).not.toHaveProperty('reason');
    }
    expect(JSON.stringify(share)).not.toMatch(/standby|queued|benched/);
  });

  it('has no bench when the import has none', () => {
    expect(raidShareFromImport(withoutBench)).not.toHaveProperty('bench');
  });

  it('passes its schema, and is the same for the same import', () => {
    expect(raidShareV1Schema.safeParse(raidShareFromImport(withBench)).success).toBe(true);
    expect(raidShareFromImport(withBench)).toEqual(raidShareFromImport(structuredClone(withBench)));
  });
});

describe('decodeRaidShare', () => {
  it('reads an encoded share back', () => {
    const share = raidShareFromImport(withBench);
    const encoded = encodeBridge(share);
    expect(encoded.ok).toBe(true);
    expect(decodeRaidShare(encoded.ok ? encoded.value : '')).toEqual({ ok: true, value: share });
  });

  it('refuses an import string, and an import refuses a share', () => {
    const imported = encodeBridge(withBench);
    const shared = encodeBridge(raidShareFromImport(withBench));
    const asShare = decodeRaidShare(imported.ok ? imported.value : '');
    const asImport = decodeRaidImport(shared.ok ? shared.value : '');
    expect(asShare.ok ? 'ok' : asShare.error.code).toBe('WRONG_KIND');
    expect(asImport.ok ? 'ok' : asImport.error.code).toBe('WRONG_KIND');
  });

  it('checks references like an import: a group may only name rostered characters', () => {
    const share = raidShareFromImport(withBench);
    const broken = { ...share, groups: [{ group: 1, characterIds: ['c_nobody'] }] };
    const result = raidShareV1Schema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('not on the roster');
  });

  it('refuses someone both rostered and on the bench', () => {
    const share = raidShareFromImport(withBench);
    const first = share.roster[0];
    if (!first) throw new Error('fixture has a roster');
    const broken = { ...share, bench: [first] };
    expect(raidShareV1Schema.safeParse(broken).success).toBe(false);
  });
});
