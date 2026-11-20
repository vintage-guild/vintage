// Recipe details (what a recipe makes and takes, for the website's tooltip), synced daily with the
// catalog, and one roster character's crafting: what it knows and what it's missing. Public.
import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  type CharacterRecipes,
  isSkillRank,
  RECIPE_DETAIL_BATCH,
  type RecipeRef,
} from '../contract';
import { command } from '../store';
import { itemLookup } from './catalog';

const text = (max: number) => z.string().max(max);
const count = z.number().min(0).max(1000);

const detailSchema = z.object({
  recipeId: z.number().int(),
  itemId: z.number().int().nullable(),
  itemName: text(120).nullable(),
  quality: text(24).nullable(),
  quantity: count,
  lines: z.array(text(300)).max(40),
  reagents: z.array(z.object({ name: text(120), quantity: count })).max(20),
});

export const armoryRecipeDetailRecord = command({
  name: 'armory-recipe-detail-record',
  description:
    'Record recipes’ details from Blizzard (the item each makes, its tooltip lines, and the ' +
    'reagents), replacing what was there. Run by the catalog sync.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  // Each detail is checked on its own, so one odd recipe doesn't cost the rest of its batch.
  input: z.object({ details: z.array(z.unknown()).max(RECIPE_DETAIL_BATCH) }),
  handler: async ({ details }, { guildId, deps, now }) => {
    const at = now();
    const valid: z.infer<typeof detailSchema>[] = [];
    const refused: { recipeId: unknown; issue: string }[] = [];
    for (const raw of details) {
      const parsed = detailSchema.safeParse(raw);
      if (parsed.success) {
        valid.push(parsed.data);
        continue;
      }
      const issue = parsed.error.issues[0];
      refused.push({
        recipeId: (raw as { recipeId?: unknown } | null)?.recipeId,
        issue: `${issue?.path.join('.') || 'detail'}: ${issue?.message ?? 'invalid'}`,
      });
    }
    await deps.armoryCatalog.putRecipeDetails(valid.map((d) => ({ ...d, guildId, syncedAt: at })));
    return success({ recorded: valid.length, refused });
  },
});

export const armoryRecipeGet = command({
  name: 'armory-recipe-get',
  description:
    'One recipe’s details for a tooltip: the item it makes (name, quality, how many), the ' +
    'item’s lines in Blizzard’s words (binding, slot, armor, stats, use effects, required ' +
    'level), and the reagents. `detail` is null until the daily catalog sync has fetched it. ' +
    'Blizzard doesn’t say where a recipe is learned.',
  tier: 'public',
  input: z.object({ recipeId: z.number().int() }),
  handler: async ({ recipeId }, { guildId, deps }) =>
    success({ detail: await deps.armoryCatalog.getRecipeDetail(guildId, recipeId) }),
});

const byName = (a: RecipeRef, b: RecipeRef) => a.name.localeCompare(b.name);

export const armoryCharacterRecipes = command({
  name: 'armory-character-recipes',
  description:
    'One roster character’s crafting, by slug (`strattaca-windfury`): for each ' +
    'profession it has with something to make, its skill, the recipes it knows, and the catalog’s recipes it doesn’t, ' +
    'each with the item it makes (null until synced). Errors: CHARACTER_NOT_FOUND.',
  tier: 'public',
  input: z.object({ slug: z.string().trim().toLowerCase().min(3).max(96) }),
  handler: async ({ slug }, { guildId, deps }) => {
    const entry = await deps.armoryRoster.getEntryBySlug(guildId, slug);
    if (!entry) return error('CHARACTER_NOT_FOUND', `No roster character "${slug}"`);
    const [known, catalog, items] = await Promise.all([
      deps.armoryRoster.listRecipes(guildId),
      deps.armoryCatalog.listCatalog(guildId),
      deps.armoryCatalog.listRecipeItems(guildId),
    ]);
    const itemOf = itemLookup(items);
    const mine = known.find((k) => k.entryId === entry.id)?.recipes ?? [];
    const professions = entry.professions
      .map((p) => {
        const knownHere = mine.filter((r) => r.profession === p.name && !isSkillRank(r, p.name));
        const knownIds = new Set(knownHere.map((r) => r.id));
        const row = catalog.find((c) => c.profession === p.name);
        return {
          profession: p.name,
          skill: p.level,
          maxSkill: p.maxLevel,
          known: knownHere
            .map((r) => ({ id: r.id, name: r.name, itemId: itemOf(r.id) }))
            .sort(byName),
          missing: (row?.categories ?? [])
            .flatMap((c) => c.recipes)
            .filter((r) => !knownIds.has(r.id) && !isSkillRank(r, p.name))
            .map((r) => ({ id: r.id, name: r.name, itemId: itemOf(r.id) }))
            .sort(byName),
        };
      })
      .filter((p) => p.known.length > 0 || p.missing.length > 0);
    const answer: CharacterRecipes = {
      name: entry.name,
      surname: entry.surname,
      slug: entry.slug,
      level: entry.level,
      className: entry.className,
      profileUrl: entry.profileUrl,
      professions,
    };
    return success(answer, {
      reasoning: professions.map((p) => `${p.profession}: ${p.known.length} known`).join(', '),
    });
  },
});
