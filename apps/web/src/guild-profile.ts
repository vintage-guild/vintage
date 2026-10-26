// The guild profile the public pages show (the site module's `guild-profile-get`): the hero's
// facts and intro, the About page, the Discord invite, the contact email. Officers edit it in the
// quarters' Guild tab.
import { type GuildProfile, STARTER_PROFILE } from '@vintage/site/contract';
import { getCommandClient } from '@vintage/ui-kit';

/** The profile, or the starter text when the server can't answer, so no page goes blank. */
export async function readGuildProfile(): Promise<GuildProfile> {
  const result = await getCommandClient().read<GuildProfile>('guild-profile-get');
  return result.success && result.data ? result.data : STARTER_PROFILE;
}

/** A section body's paragraphs: separated by a blank line, trimmed, empty ones dropped. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
