// One recipe's details for the website's tooltip: the item it makes (in Blizzard's own display
// strings) and its reagents. Pure but for the injected client.
import type { ForeverApi, Item, Recipe } from '@vintage/forever-api';
import type { RecipeDetail } from '../contract';

export type RecipeClient = Pick<ForeverApi, 'recipe' | 'item'>;

export type RecipeDetailFetch = Omit<RecipeDetail, 'id' | 'guildId' | 'syncedAt'>;

/** The item's tooltip lines, top to bottom, the way the game shows them. */
export function itemLines(item: Item | null): string[] {
  const p = item?.preview_item;
  if (!p) return [];
  const slot = [
    p.inventory_type?.type === 'NON_EQUIP' ? undefined : p.inventory_type?.name,
    p.is_subclass_hidden ? undefined : p.item_subclass?.name,
  ]
    .filter(Boolean)
    .join(', ');
  const lines = [
    p.binding?.name,
    slot || undefined,
    p.weapon?.damage?.display_string,
    p.weapon?.attack_speed?.display_string,
    p.weapon?.dps?.display_string,
    p.armor?.display?.display_string,
    ...p.stats.map((s) =>
      s.display?.display_string && s.is_equip_bonus
        ? `Equip: ${s.display.display_string}`
        : s.display?.display_string,
    ),
    ...p.spells.map((s) => s.description),
    p.description,
    p.requirements?.skill?.display_string,
    p.requirements?.level?.display_string,
  ];
  return lines.filter((l): l is string => Boolean(l?.trim()));
}

/** Bounds `armory-recipe-detail-record` checks; an odd item is trimmed, not refused. */
const LIMITS = { lines: 40, line: 300, reagents: 20, name: 120, quantity: 1000 };

export function toRecipeDetail(
  recipeId: number,
  recipe: Recipe | null,
  item: Item | null,
): RecipeDetailFetch {
  const name = item?.name ?? recipe?.crafted_item?.name ?? null;
  return {
    recipeId,
    itemId: recipe?.crafted_item?.id ?? null,
    itemName: name?.slice(0, LIMITS.name) ?? null,
    quality: item?.quality?.type.toLowerCase().slice(0, 24) ?? null,
    quantity: Math.min(Math.max(recipe?.crafted_quantity?.value ?? 1, 0), LIMITS.quantity),
    lines: itemLines(item)
      .slice(0, LIMITS.lines)
      .map((l) => l.slice(0, LIMITS.line)),
    reagents: (recipe?.reagents ?? [])
      .flatMap((r) =>
        r.reagent.name
          ? [
              {
                name: r.reagent.name.slice(0, LIMITS.name),
                quantity: Math.min(Math.max(r.quantity, 0), LIMITS.quantity),
              },
            ]
          : [],
      )
      .slice(0, LIMITS.reagents),
  };
}

/** Ask Blizzard about one recipe and the item it makes. Throws when a request fails. */
export async function fetchRecipeDetail(
  client: RecipeClient,
  recipeId: number,
): Promise<RecipeDetailFetch> {
  const recipe = await client.recipe(recipeId);
  const item = recipe?.crafted_item ? await client.item(recipe.crafted_item.id) : null;
  return toRecipeDetail(recipeId, recipe, item);
}
