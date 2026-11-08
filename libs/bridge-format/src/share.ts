// The members' view of an import (docs/features/active/addon-for-members). An officer's addon
// cuts it from the import it holds and shares it with the guild; the addon's `Core/Share.lua`
// does exactly what this does, and the `raid-share.v1` fixture checks that both sides agree.
// Two officers holding the same import must produce the same share, byte for byte, so nothing
// here may depend on who builds it or when.
import type { RaidImport, RaidShare } from './schemas';

/** A bench entry without its reason (standby, queued, benched): that stays with the officers. */
function withoutReason(
  entry: NonNullable<RaidImport['bench']>[number],
): RaidShare['roster'][number] {
  return {
    characterId: entry.characterId,
    name: entry.name,
    class: entry.class,
    ...(entry.spec === undefined ? {} : { spec: entry.spec }),
    role: entry.role,
  };
}

/** The share for an import: everything a member may see, in the import's order. */
export function raidShareFromImport(raidImport: RaidImport): RaidShare {
  return {
    v: raidImport.v,
    kind: 'raid-share',
    guildId: raidImport.guildId,
    generatedAt: raidImport.generatedAt,
    raid: raidImport.raid,
    roster: raidImport.roster,
    ...(raidImport.bench === undefined ? {} : { bench: raidImport.bench.map(withoutReason) }),
    groups: raidImport.groups,
    loot: raidImport.loot,
    candidates: raidImport.candidates,
  };
}
