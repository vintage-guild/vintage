// The role-sync run, independent of Convex so it can be tested with a fake directory.
// convex/roleSync.ts wires it to the Discord directory and the `commands:syncMembers` mutation.
import {
  type GuildDirectory,
  type MemberSyncInput,
  planRoleSync,
  readDirectory,
} from '@vintage/identity/commands';

export interface RoleSyncDeps {
  directory: GuildDirectory;
  /** Members identity already knows, so the ones who left can be found. */
  knownMembers(): Promise<{ discordId: string; displayName: string }[]>;
  /** Run `member-sync` for a batch of inputs. */
  apply(batch: MemberSyncInput[]): Promise<{ synced: number; failed: unknown[] }>;
  batchSize?: number;
}

export interface RoleSyncSummary {
  inServer: number;
  departed: number;
  synced: number;
  failed: unknown[];
}

export async function runRoleSync(deps: RoleSyncDeps): Promise<RoleSyncSummary> {
  const directory = await readDirectory(deps.directory);
  const known = await deps.knownMembers();
  if (directory.length === 0 && known.length > 0) {
    // A real guild always lists someone. Treating an empty answer as "everyone left" would
    // strip every rank, so refuse instead.
    throw new Error('Discord returned no guild members; refusing to mark everyone as departed');
  }
  const plan = planRoleSync(directory, known);
  const summary: RoleSyncSummary = {
    inServer: plan.filter((p) => p.inServer).length,
    departed: plan.filter((p) => !p.inServer).length,
    synced: 0,
    failed: [],
  };
  const size = deps.batchSize ?? 100;
  for (let i = 0; i < plan.length; i += size) {
    const result = await deps.apply(plan.slice(i, i + size));
    summary.synced += result.synced;
    summary.failed.push(...result.failed);
  }
  return summary;
}
