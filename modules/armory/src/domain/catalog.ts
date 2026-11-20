// One profession's recipe catalog from Blizzard's game data, as `armory-catalog-record` takes it.
import type { ForeverApi, ProfessionIndex } from '@vintage/forever-api';
import { type CatalogCategory, GATHERING_PROFESSIONS } from '../contract';

export type CatalogClient = Pick<ForeverApi, 'profession' | 'professionSkillTier'>;

/** The professions worth a catalog: not "Test Profession", not gathering skills. */
export const catalogProfessions = (index: ProfessionIndex) =>
  index.professions.flatMap(({ id, name }) =>
    name && !/^test/i.test(name) && !GATHERING_PROFESSIONS.includes(name) ? [{ id, name }] : [],
  );

/** Every category with a named recipe across the profession's skill tiers. Throws on failure. */
export async function fetchCatalog(client: CatalogClient, id: number): Promise<CatalogCategory[]> {
  const categories: CatalogCategory[] = [];
  for (const tier of (await client.profession(id))?.skill_tiers ?? []) {
    const detail = await client.professionSkillTier(id, tier.id);
    for (const c of detail?.categories ?? []) {
      const recipes = c.recipes.flatMap((r) => (r.name ? [{ id: r.id, name: r.name }] : []));
      if (recipes.length > 0) categories.push({ name: c.name ?? 'Other', recipes });
    }
  }
  return categories;
}
