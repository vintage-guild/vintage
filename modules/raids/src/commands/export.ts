// raid-export-check: read an addon export string and match it to a raid, without recording it
// (#29's read-only first step). The same check runs on the website, in Discord, and over /mcp.
import { decodeRaidExport } from '@vintage/bridge-format';
import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import type { ExportCheck } from '../contract';
import { checkExport, summarize } from '../domain/export-check';
import { command } from '../store';
import { eventNotFound } from './shared';

/** The bridge format's own cap on a pasted string (DEFAULT_DECODE_LIMITS.maxEncodedLength). */
const MAX_EXPORT_LENGTH = 1_000_000;

export const raidExportCheck = command({
  name: 'raid-export-check',
  description:
    'Read a raid export string from the Vintage addon and match it to the raid: who was seen in ' +
    'each snapshot, the loot, who was not signed up, and who signed up but was not seen. ' +
    'Records nothing. Pass eventId to check it against a raid the export does not name.',
  tier: 'leader',
  input: z.object({
    exportString: z.string().min(1).max(MAX_EXPORT_LENGTH),
    eventId: z.string().min(1).optional(),
  }),
  handler: async ({ exportString, eventId }, { guildId, deps }) => {
    const decoded = decodeRaidExport(exportString);
    if (!decoded.ok) {
      const { code, message, suggestion, details } = decoded.error;
      return error(code, message, {
        suggestion,
        retryable: false,
        ...(details ? { details } : {}),
      });
    }
    const exported = decoded.value;

    // The caller's raid wins; otherwise the raid the addon imported, if it is in this guild.
    const sameGuild = exported.guildId === undefined || exported.guildId === guildId;
    const wanted = eventId ?? (sameGuild ? exported.eventId : undefined);
    const event = wanted ? await deps.raids.getEvent(guildId, wanted) : null;
    if (eventId && !event) return eventNotFound();
    const signups = event ? await deps.raids.listSignups(guildId, event.id) : [];

    const check: ExportCheck = checkExport(exported, event, signups, {
      guildId,
      eventSource: event ? (eventId ? 'input' : 'export') : null,
    });
    return success(check, { reasoning: summarize(check) });
  },
});
