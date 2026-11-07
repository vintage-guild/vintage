// Response shapes for the Forever profile endpoints Vintage reads. Blizzard hasn't documented
// the Forever namespace (Nov 2026), so these keep only the fields Vintage uses, make most of them
// optional, and ignore the rest: a new or missing field never breaks a fetch, a changed type on a
// field Vintage reads does (it fails the parse, and the caller keeps what it had).
// Field names follow the community's live probes and the Retail API they mirror (see README).
import { z } from 'zod';

/** `{ type: 'EPIC', name: 'Epic' }`; names are strings because every request sends a locale. */
const typed = z.object({ type: z.string(), name: z.string().optional() });
const named = z.object({ id: z.number().int(), name: z.string().optional() });

/** `/profile/wow/character/{name}-{surname}` */
export const characterProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  surname: z.string().optional(),
  level: z.number().int(),
  character_class: named.optional(),
  race: named.optional(),
  faction: typed.optional(),
  guild: z.object({ name: z.string(), slug: z.string().optional() }).optional(),
  active_spec: z.object({ name: z.string().optional() }).optional(),
  equipped_item_level: z.number().optional(),
  average_item_level: z.number().optional(),
  last_login_timestamp: z.number().optional(),
});
export type CharacterProfile = z.infer<typeof characterProfileSchema>;

/** `/profile/wow/character/{name}-{surname}/equipment` */
export const characterEquipmentSchema = z.object({
  equipped_items: z
    .array(
      z.object({
        item: z.object({ id: z.number().int() }),
        slot: typed,
        quality: typed.optional(),
        name: z.string().optional(),
        level: z.object({ value: z.number() }).optional(),
      }),
    )
    .default([]),
});
export type CharacterEquipment = z.infer<typeof characterEquipmentSchema>;

/** `/profile/wow/character/{name}-{surname}/character-media` */
export const characterMediaSchema = z.object({
  assets: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
});
export type CharacterMedia = z.infer<typeof characterMediaSchema>;

/**
 * `/profile/wow/character/{name}-{surname}/specializations`. Forever uses talent trees: the active
 * group lists the trees with points spent (live, US, Nov 7 2026: one group, one tree,
 * `specialization: { name: 'Protection' }`, `spent_points: 11`).
 */
export const characterSpecializationsSchema = z.object({
  specialization_groups: z
    .array(
      z.object({
        is_active: z.boolean().optional(),
        specializations: z
          .array(
            z.object({
              specialization: z.object({ name: z.string().optional() }).optional(),
              specialization_name: z.string().optional(),
              spent_points: z.number().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type CharacterSpecializations = z.infer<typeof characterSpecializationsSchema>;

/** `/data/wow/guild/{slug}/roster` (profile namespace; Forever guilds have no realm). */
export const guildRosterSchema = z.object({
  guild: z.object({ name: z.string(), slug: z.string().optional() }).optional(),
  members: z
    .array(
      z.object({
        character: z.object({
          id: z.number().int(),
          name: z.string(),
          surname: z.string().optional(),
          level: z.number().int().optional(),
          playable_class: z.object({ id: z.number().int() }).optional(),
          playable_race: z.object({ id: z.number().int() }).optional(),
        }),
        rank: z.number().int(),
      }),
    )
    .default([]),
});
export type GuildRoster = z.infer<typeof guildRosterSchema>;

/** `https://oauth.battle.net/token` with `grant_type=client_credentials`. */
export const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
