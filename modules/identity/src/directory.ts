/** A guild member as the Discord directory reports them. */
export interface DirectoryMember {
  discordId: string;
  /** Server nickname, else global name, else username. */
  displayName: string;
  roleIds: string[];
}

export interface GuildDirectoryPage {
  members: DirectoryMember[];
  /** Cursor for the next page, or null when this was the last one. */
  next: string | null;
}

/**
 * Port to the guild's Discord member list (the bot's `GET /guilds/{id}/members`). The role-sync
 * cron pages through it; apps/api adapts it to the Discord REST API, tests use a fake.
 */
export interface GuildDirectory {
  /** One page of members, starting after `cursor` (null for the first page). */
  page(cursor: string | null): Promise<GuildDirectoryPage>;
}

/**
 * Read every member, page by page. Throws instead of returning a partial list: a short list
 * would make the planner treat everyone missing from it as having left the server.
 */
export async function readDirectory(
  directory: GuildDirectory,
  { maxPages = 100 }: { maxPages?: number } = {},
): Promise<DirectoryMember[]> {
  const members: DirectoryMember[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < maxPages; pages++) {
    const page: GuildDirectoryPage = await directory.page(cursor);
    members.push(...page.members);
    if (page.next === null) return members;
    if (page.next === cursor) throw new Error(`Guild directory cursor stuck at ${cursor}`);
    cursor = page.next;
  }
  throw new Error(`Guild directory has more than ${maxPages} pages; refusing a partial sync`);
}
