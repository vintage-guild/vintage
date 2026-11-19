// Who in the guild can craft what: the roster's known recipes, searched by name. Public like the
// roster itself (Blizzard's armory shows the same recipes to anyone).
import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { RECIPE_SEARCH_LIMIT, type RecipeMatch } from '../contract';
import { command } from '../store';

export const armoryRecipeSearch = command({
  name: 'armory-recipe-search',
  description:
    'Find recipes someone in the guild’s in-game roster knows, by part of the recipe’s name ' +
    '(at least 2 letters, any case), optionally in one profession. Answers each matching recipe ' +
    'with everyone who knows it (name, level, class, armory page, and their skill in that ' +
    `profession), highest skill first; recipes sorted by name, at most ${RECIPE_SEARCH_LIMIT}. ` +
    '`truncated` is true when more matched. Recipes come from the roster sync, so a character ' +
    'shows its new recipes within a day.',
  tier: 'public',
  input: z.object({
    query: z.string().trim().min(2).max(60),
    profession: z.string().max(48).optional(),
  }),
  handler: async ({ query, profession }, { guildId, deps }) => {
    const needle = query.toLowerCase();
    const matches = new Map<number, RecipeMatch>();
    for (const entry of await deps.armoryRoster.listEntries(guildId)) {
      for (const recipe of entry.recipes) {
        if (profession && recipe.profession !== profession) continue;
        if (!recipe.name.toLowerCase().includes(needle)) continue;
        const skill = entry.professions.find((p) => p.name === recipe.profession);
        const match = matches.get(recipe.id) ?? {
          id: recipe.id,
          name: recipe.name,
          profession: recipe.profession,
          crafters: [],
        };
        match.crafters.push({
          name: entry.name,
          surname: entry.surname,
          slug: entry.slug,
          level: entry.level,
          className: entry.className,
          profileUrl: entry.profileUrl,
          skill: skill?.level ?? 0,
          maxSkill: skill?.maxLevel ?? null,
        });
        matches.set(recipe.id, match);
      }
    }
    const all = [...matches.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const match of all) {
      match.crafters.sort((a, b) => b.skill - a.skill || a.name.localeCompare(b.name));
    }
    return success(
      { recipes: all.slice(0, RECIPE_SEARCH_LIMIT), truncated: all.length > RECIPE_SEARCH_LIMIT },
      { reasoning: `${all.length} recipe(s) match "${query}"` },
    );
  },
});
