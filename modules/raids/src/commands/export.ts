// raid-export-check reads an addon export string and matches it to a raid without recording it;
// raid-export-record stores the same match: attendance in raids, drops in loot (#29). Both run
// the same way on the website, in Discord, and over /mcp.
import { decodeRaidExport, type RaidExport } from '@vintage/bridge-format';
import { type CommandResult, error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import type { ExportCheck, RaidEvent, Signup } from '../contract';
import { checkExport, summarize } from '../domain/export-check';
import { attendanceFrom, attendeesOf, dropsFrom, exportKey } from '../domain/export-record';
import { command, type RaidsDeps } from '../store';
import { eventNotFound, isLive } from './shared';

/** The bridge format's own cap on a pasted string (DEFAULT_DECODE_LIMITS.maxEncodedLength). */
const MAX_EXPORT_LENGTH = 1_000_000;

const exportInput = z.object({
  exportString: z.string().min(1).max(MAX_EXPORT_LENGTH),
  eventId: z.string().min(1).optional(),
});

interface ReadExport {
  exported: RaidExport;
  event: RaidEvent | null;
  signups: Signup[];
  check: ExportCheck;
}

/** Decodes the export and matches it: the caller's raid wins, else the export's own in this guild. */
async function readExport(
  { exportString, eventId }: z.output<typeof exportInput>,
  guildId: string,
  deps: RaidsDeps,
): Promise<ReadExport | CommandResult> {
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

  const sameGuild = exported.guildId === undefined || exported.guildId === guildId;
  const wanted = eventId ?? (sameGuild ? exported.eventId : undefined);
  const event = wanted ? await deps.raids.getEvent(guildId, wanted) : null;
  if (eventId && !event) return eventNotFound();
  const signups = event ? await deps.raids.listSignups(guildId, event.id) : [];

  const check = checkExport(exported, event, signups, {
    guildId,
    eventSource: event ? (eventId ? 'input' : 'export') : null,
  });
  return { exported, event, signups, check };
}

const failed = (read: ReadExport | CommandResult): read is CommandResult => 'success' in read;

export const raidExportCheck = command({
  name: 'raid-export-check',
  description:
    'Read a raid export string from the Vintage addon and match it to the raid: who was seen in ' +
    'each snapshot, the loot, who was not signed up, and who signed up but was not seen. ' +
    'Records nothing. Pass eventId to check it against a raid the export does not name.',
  tier: 'leader',
  input: exportInput,
  handler: async (input, { guildId, deps }) => {
    const read = await readExport(input, guildId, deps);
    if (failed(read)) return read;
    return success(read.check, { reasoning: summarize(read.check) });
  },
});

export const raidExportRecord = command({
  name: 'raid-export-record',
  description:
    'Record a raid export string from the Vintage addon: who attended (anyone in a snapshot) and ' +
    'what dropped, under the raid’s loot method. Completes the raid if it isn’t already. Shows ' +
    'the check first; confirm to record. A different export for the same raid replaces the ' +
    'earlier one; the same export again changes nothing. Pass eventId when the export names no raid.',
  tier: 'officer',
  destructive: true,
  input: exportInput,
  handler: async (input, { caller, guildId, deps, dryRun, now }) => {
    const read = await readExport(input, guildId, deps);
    if (failed(read)) return read;
    const { exported, event, signups, check } = read;

    if (!event) {
      return error('RAID_NOT_MATCHED', 'This export doesn’t name a raid in this guild', {
        suggestion: 'Pass the eventId of the raid it belongs to (raid-list shows recent raids)',
        retryable: false,
      });
    }
    if (event.status === 'cancelled') {
      return error('RAID_CANCELLED', `${event.name} was cancelled`, {
        suggestion: 'Pass the eventId of the raid the export belongs to',
        retryable: false,
      });
    }
    if (event.startsAt > now()) {
      return error('RAID_NOT_STARTED', `${event.name} hasn't started yet`, {
        suggestion: 'Record the export after the raid, or pass the eventId of the raid it was',
        retryable: false,
      });
    }
    if (!exported.attendance.length) {
      return error('EXPORT_EMPTY', 'This export has no attendance snapshots', {
        suggestion: 'Take at least one attendance snapshot in the addon, then export again',
        retryable: false,
      });
    }

    const raid = { id: event.id, name: event.name, startsAt: event.startsAt, status: event.status };
    const previous = await deps.raids.getRecord(guildId, event.id);
    const key = exportKey(exported);
    if (previous?.exportKey === key) {
      return success(
        { event: raid, unchanged: true, record: previous },
        { reasoning: `${event.name} already has this export recorded; nothing changed` },
      );
    }

    const recordedAt = now();
    const attendance = attendanceFrom(exported, check);
    const drops = dropsFrom(check, event, signups, recordedAt);
    const completes = isLive(event);
    const what =
      `${attendance.length} attended, ${drops.length} drop${drops.length === 1 ? '' : 's'}` +
      (previous ? '; replaces the export recorded before' : '') +
      (completes ? `; completes ${event.name}` : '');
    if (dryRun) {
      return success(
        { event: raid, unchanged: false, replaces: previous, completes, attendance, drops, check },
        { reasoning: `Records ${event.name}: ${what}` },
      );
    }

    const record = await deps.raids.putRecord(
      {
        guildId,
        eventId: event.id,
        exportKey: key,
        exporter: exported.exporter,
        exportedAt: exported.exportedAt * 1000,
        addonVersion: exported.addonVersion,
        snapshots: exported.attendance.length,
        attended: attendance.length,
        drops: drops.length,
        recordedAt,
        recordedBy: caller.memberId ?? caller.surface,
      },
      attendance,
    );
    await deps.raidLoot.replaceDrops(guildId, event.id, drops);
    const attendees = attendeesOf(attendance);
    if (completes) {
      await deps.raids.updateEvent(guildId, event.id, { status: 'completed' });
      await deps.events.emit(guildId, 'raid-completed', {
        eventId: event.id,
        scheduleId: event.scheduleId,
        startsAt: event.startsAt,
        attendees,
      });
    }
    await deps.events.emit(guildId, 'raid-recorded', {
      eventId: event.id,
      attendees,
      drops: drops.length,
      replaced: previous !== null,
    });
    return success(
      {
        event: { ...raid, status: completes ? ('completed' as const) : event.status },
        unchanged: false,
        record,
        attendance,
        drops,
        warnings: check.warnings,
      },
      { reasoning: `Recorded ${event.name}: ${what}` },
    );
  },
});

export const attendanceList = command({
  name: 'attendance-list',
  description:
    'Who attended a raid, as recorded from the addon export (raid-export-record): each person ' +
    'seen, how many snapshots they were in and which, and their signup when they had one. ' +
    'Empty until an officer records the raid.',
  tier: 'recruit',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const record = await deps.raids.getRecord(guildId, eventId);
    const attendance = record ? await deps.raids.listAttendance(guildId, eventId) : [];
    return success(
      { eventId, record, attendance },
      {
        reasoning: record
          ? `${event.name}: ${attendance.length} attended`
          : `${event.name} has no recorded attendance yet`,
      },
    );
  },
});
