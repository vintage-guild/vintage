// Who on the roster knows which recipe, shared by the recipe search and the profession views.
import type { RecipeCrafter, RosterEntry, RosterRecipe, RosterRecipes } from '../contract';

/** A roster character as a recipe's crafter, with its skill in the recipe's profession. */
export const toCrafter = (entry: RosterEntry, profession: string): RecipeCrafter => {
  const skill = entry.professions.find((p) => p.name === profession);
  return {
    name: entry.name,
    surname: entry.surname,
    slug: entry.slug,
    level: entry.level,
    className: entry.className,
    profileUrl: entry.profileUrl,
    skill: skill?.level ?? 0,
    maxSkill: skill?.maxLevel ?? null,
  };
};

export const bySkill = (a: RecipeCrafter, b: RecipeCrafter) =>
  b.skill - a.skill || a.name.localeCompare(b.name);

/** Every recipe someone knows, by recipe id, with its crafters best first. */
export function knownRecipes(
  entries: RosterEntry[],
  known: RosterRecipes[],
): Map<number, { recipe: RosterRecipe; crafters: RecipeCrafter[] }> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out = new Map<number, { recipe: RosterRecipe; crafters: RecipeCrafter[] }>();
  for (const { entryId, recipes } of known) {
    const entry = byId.get(entryId);
    if (!entry) continue;
    for (const recipe of recipes) {
      const hit = out.get(recipe.id) ?? { recipe, crafters: [] };
      hit.crafters.push(toCrafter(entry, recipe.profession));
      out.set(recipe.id, hit);
    }
  }
  for (const hit of out.values()) hit.crafters.sort(bySkill);
  return out;
}
