// Raid insights delivery (#137): after an officer confirms insights-send, one DM per opted-in
// raider with findings. A Decisions question drops findings the model is sure won't help (never
// all of them), Terra at low effort words the note, and the plain findings are the fallback.
// Every DM carries the evidence. Without DISCORD_BOT_TOKEN nothing is sent.
//   npx convex run insights:send '{"runId":"…"}'

import { createDiscordRest, DiscordRestError } from '@vintage/discord-kit';
import { DM_INSTRUCTIONS, gateFindings, plainDm } from '@vintage/insights/commands';
import type { InsightFinding } from '@vintage/insights/contract';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
import { decisionsFor } from './decisions';
import { identityStore, insightsStore } from './stores';
import { writeWording } from './wording';

/** The run, and for each opted-in member with findings: their Discord id and findings. */
export const recipients = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const store = insightsStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    if (!run) return null;
    const [findings, optedIn] = await Promise.all([
      store.listFindings(GUILD_ID, runId),
      store.listOptedIn(GUILD_ID),
    ]);
    const people = identityStore(ctx);
    const byMember = new Map<string, InsightFinding[]>();
    for (const f of findings) {
      if (!f.memberId || !optedIn.includes(f.memberId)) continue;
      byMember.set(f.memberId, [...(byMember.get(f.memberId) ?? []), f]);
    }
    const out: { discordId: string; findings: InsightFinding[] }[] = [];
    for (const [memberId, list] of byMember) {
      const member = await people.getMember(GUILD_ID, memberId);
      if (member && !member.prefs.dmOptOut)
        out.push({ discordId: member.discordId, findings: list });
    }
    return { zoneName: run.zoneName, recipients: out };
  },
});

/** One DM; false when it couldn't be sent. 50007: they don't accept DMs from this server, and the
 * findings stay readable with insights-get. */
async function dm(
  discord: ReturnType<typeof createDiscordRest>,
  recipientId: string,
  content: string,
  runId: string,
): Promise<boolean> {
  try {
    const channel = (await discord.request('POST', '/users/@me/channels', {
      body: { recipient_id: recipientId },
    })) as { id: string };
    await discord.createMessage(channel.id, {
      content: content.slice(0, 2000),
      allowed_mentions: { parse: [] },
    });
    return true;
  } catch (err) {
    if (!(err instanceof DiscordRestError && err.code === 50007)) {
      console.log(`insights ${runId}: DM failed: ${err instanceof Error ? err.message : err}`);
    }
    return false;
  }
}

export const send = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<{ sent: number; skipped: number }> => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const loaded = await ctx.runQuery(internal.insights.recipients, { runId });
    if (!loaded || !token) return { sent: 0, skipped: loaded?.recipients.length ?? 0 };
    const discord = createDiscordRest({ token });
    let sent = 0;
    let skipped = 0;
    for (const r of loaded.recipients) {
      const picked = await gateFindings(decisionsFor(ctx, 'insights-gate'), r.findings, GUILD_ID);
      const facts = plainDm(loaded.zoneName, picked);
      const worded = await writeWording(ctx, 'insights-dm', DM_INSTRUCTIONS, facts).catch(
        () => null,
      );
      // The wording drops the evidence lines' format; keep the evidence by appending the facts.
      // Only the wording is cut to fit, so the facts and the opt-out line always arrive whole.
      const room = 2000 - facts.length - 2;
      const content = worded && room > 0 ? `${worded.trim().slice(0, room)}\n\n${facts}` : facts;
      if (await dm(discord, r.discordId, content, runId)) sent++;
      else skipped++;
    }
    console.log(`insights ${runId}: ${sent} DMs sent, ${skipped} skipped`);
    return { sent, skipped };
  },
});
