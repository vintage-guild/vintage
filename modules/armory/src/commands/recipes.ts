// Who in the guild can craft what: recipes searched by name, from Blizzard's catalog and the
// roster's known recipes. Public like the roster itself (Blizzard's armory shows the same).
import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { RECIPE_SEARCH_LIMIT, type RecipeMatch } from '../contract';
import { command } from '../store';
import { itemLookup } from './catalog';
import { knownRecipes } from './crafters';

export const armoryRecipeSearch = command({
  name: 'armory-recipe-search',
  description:
    'Find recipes by part of the name (at least 2 letters, any case), optionally in one ' +
    'profession: every recipe in Blizzard’s catalog plus any the roster knows that the catalog ' +
    'lacks. Answers each with everyone on the roster who knows it (name, level, class, armory ' +
    'page, and their skill in that profession), highest skill first, or none; recipes sorted by ' +
    `name, at most ${RECIPE_SEARCH_LIMIT}. \`truncated\` is true when more matched. Known ` +
    'recipes come from the roster sync, so a character shows its new recipes within a day.',
  tier: 'public',
  input: z.object({
    query: z.string().trim().min(2).max(60),
    profession: z.string().max(48).optional(),
  }),
  handler: async ({ query, profession }, { guildId, deps }) => {
    const needle = query.toLowerCase();
    const [entries, known, catalog, items] = await Promise.all([
      deps.armoryRoster.listEntries(guildId),
      deps.armoryRoster.listRecipes(guildId),
      deps.armoryCatalog.listCatalog(guildId),
      deps.armoryCatalog.listRecipeItems(guildId),
    ]);
    const itemOf = itemLookup(items);
    const matches = new Map<number, RecipeMatch>();
    const wanted = (name: string, prof: string) =>
      (!profession || prof === profession) && name.toLowerCase().includes(needle);
    for (const { recipe, crafters } of knownRecipes(entries, known).values()) {
      if (wanted(recipe.name, recipe.profession)) {
        matches.set(recipe.id, { ...recipe, ...itemOf(recipe.id), crafters });
      }
    }
    for (const row of catalog) {
      for (const recipe of row.categories.flatMap((c) => c.recipes)) {
        if (!matches.has(recipe.id) && wanted(recipe.name, row.profession)) {
          matches.set(recipe.id, {
            ...recipe,
            profession: row.profession,
            ...itemOf(recipe.id),
            crafters: [],
          });
        }
      }
    }
    const all = [...matches.values()].sort((a, b) => a.name.localeCompare(b.name));
    return success(
      { recipes: all.slice(0, RECIPE_SEARCH_LIMIT), truncated: all.length > RECIPE_SEARCH_LIMIT },
      { reasoning: `${all.length} recipe(s) match "${query}"` },
    );
  },
});
