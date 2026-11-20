// The recipe catalog: every recipe each profession has, from Blizzard's game data, kept by a daily
// sync (two system-only commands; apps/api's action calls Blizzard), and read with the roster's
// knowledge by the profession overview and each profession's page. Public like the roster.
import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  type CatalogRecipe,
  GATHERING_PROFESSIONS,
  type ProfessionDetail,
  type ProfessionSummary,
} from '../contract';
import { command } from '../store';
import { bySkill, knownRecipes, toCrafter } from './crafters';

/** Characters below this level aren't on the armory, so they aren't counted as crafters. */
const MIN_LEVEL = 10;

/** `First Aid`, `first-aid`, and `first aid` are the same profession. */
const sameProfession = (a: string, b: string) =>
  a.toLowerCase().replace(/[-\s]+/g, ' ') === b.toLowerCase().replace(/[-\s]+/g, ' ');

export const armoryCatalogSync = command({
  name: 'armory-catalog-sync',
  description:
    'Ask Blizzard for every profession’s recipe catalog and record it ' +
    '(armory-catalog-record, one profession per call). Run by the cron once a day.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    await deps.armoryCatalogEffects.sync(guildId);
    return success({ requested: true });
  },
});

const name = z.string().min(1).max(120);

export const armoryCatalogRecord = command({
  name: 'armory-catalog-record',
  description:
    'Record one profession’s recipe catalog from Blizzard, replacing what was there. Run by ' +
    'the catalog sync.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({
    profession: z.string().min(1).max(48),
    professionId: z.number().int(),
    categories: z
      .array(
        z.object({
          name: z.string().max(80),
          recipes: z.array(z.object({ id: z.number().int(), name })).max(1000),
        }),
      )
      .max(100),
  }),
  handler: async (input, { guildId, deps, now }) => {
    await deps.armoryCatalog.putCatalog({ guildId, ...input, syncedAt: now() });
    const recipes = input.categories.reduce((n, c) => n + c.recipes.length, 0);
    return success(
      { profession: input.profession, recipes },
      { reasoning: `${input.profession}: ${recipes} recipes` },
    );
  },
});

export const armoryProfessionList = command({
  name: 'armory-profession-list',
  description:
    'Every crafting profession (not Fishing, Herbalism, or Skinning), for the website’s ' +
    'overview: how many recipes Blizzard’s ' +
    'catalog has (null before the catalog syncs), how many someone on the roster knows, how ' +
    'many roster characters (level 10 and up) have the profession, and the best three by ' +
    'skill. Sorted by profession name.',
  tier: 'public',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    const [entries, known, catalog] = await Promise.all([
      deps.armoryRoster.listEntries(guildId),
      deps.armoryRoster.listRecipes(guildId),
      deps.armoryCatalog.listCatalog(guildId),
    ]);
    const knownById = knownRecipes(entries, known);
    const names = new Set(catalog.map((c) => c.profession));
    for (const { recipe } of knownById.values()) names.add(recipe.profession);
    for (const gathering of GATHERING_PROFESSIONS) names.delete(gathering);
    const listed = entries.filter((e) => e.level >= MIN_LEVEL);
    const summaries: ProfessionSummary[] = [...names].sort().map((profession) => {
      const row = catalog.find((c) => c.profession === profession);
      const ids = row?.categories.flatMap((c) => c.recipes.map((r) => r.id)) ?? [];
      const crafters = listed
        .filter((e) => e.professions.some((p) => p.name === profession))
        .map((e) => toCrafter(e, profession))
        .sort(bySkill);
      return {
        profession,
        recipeCount: row ? ids.length : null,
        knownCount: row
          ? ids.filter((id) => knownById.has(id)).length
          : [...knownById.values()].filter((k) => k.recipe.profession === profession).length,
        crafterCount: crafters.length,
        top: crafters.slice(0, 3),
      };
    });
    return success(summaries, { reasoning: `${summaries.length} profession(s)` });
  },
});

export const armoryProfessionGet = command({
  name: 'armory-profession-get',
  description:
    'One profession’s whole recipe catalog, in Blizzard’s categories, each recipe with ' +
    'everyone on the roster who knows it (best skill first) or none. Recipes the roster knows ' +
    'that the catalog lacks are listed under "Other". The profession may be written any case, ' +
    'with spaces or hyphens (`first-aid`). Errors: PROFESSION_NOT_FOUND.',
  tier: 'public',
  input: z.object({ profession: z.string().trim().min(1).max(48) }),
  handler: async ({ profession }, { guildId, deps }) => {
    const [entries, known, catalog] = await Promise.all([
      deps.armoryRoster.listEntries(guildId),
      deps.armoryRoster.listRecipes(guildId),
      deps.armoryCatalog.listCatalog(guildId),
    ]);
    const knownById = knownRecipes(entries, known);
    const row = catalog.find((c) => sameProfession(c.profession, profession));
    const knownHere = [...knownById.values()].filter((k) =>
      sameProfession(k.recipe.profession, profession),
    );
    const name = row?.profession ?? knownHere[0]?.recipe.profession;
    if (!name) return error('PROFESSION_NOT_FOUND', `No profession called "${profession}"`);

    const inCatalog = new Set<number>();
    const categories = (row?.categories ?? []).map((c) => ({
      name: c.name,
      recipes: c.recipes.map((r): CatalogRecipe => {
        inCatalog.add(r.id);
        return { id: r.id, name: r.name, crafters: knownById.get(r.id)?.crafters ?? [] };
      }),
    }));
    const other = knownHere
      .filter((k) => !inCatalog.has(k.recipe.id))
      .map((k) => ({ id: k.recipe.id, name: k.recipe.name, crafters: k.crafters }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (other.length > 0) categories.push({ name: 'Other', recipes: other });

    const all = categories.flatMap((c) => c.recipes);
    const detail: ProfessionDetail = {
      profession: name,
      recipeCount: all.length,
      knownCount: all.filter((r) => r.crafters.length > 0).length,
      categories,
    };
    return success(detail, {
      reasoning: `${name}: ${detail.knownCount} of ${detail.recipeCount} recipes known`,
    });
  },
});
