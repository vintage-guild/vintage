/**
 * Blizzard's class icon on Wowhead's image CDN, the same icons the bot's emoji use. Loaded, never
 * committed (assets/emoji/README.md); the Privacy page says the browser fetches them from Wowhead.
 * Sizes: small 18px, medium 36px, large 56px.
 */
export function classIcon(wowClass: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const slug = wowClass.toLowerCase().replace(/[^a-z]/g, '');
  return `https://wow.zamimg.com/images/wow/icons/${size}/classicon_${slug}.jpg`;
}

/** Each profession's icon on the same CDN (checked to load, 2026-11-19). */
const PROFESSION_ICONS: Readonly<Record<string, string>> = {
  Alchemy: 'trade_alchemy',
  Blacksmithing: 'trade_blacksmithing',
  Enchanting: 'trade_engraving',
  Engineering: 'trade_engineering',
  Herbalism: 'trade_herbalism',
  Leatherworking: 'trade_leatherworking',
  Mining: 'trade_mining',
  Skinning: 'inv_misc_pelt_wolf_01',
  Tailoring: 'trade_tailoring',
  Cooking: 'inv_misc_food_15',
  'First Aid': 'spell_holy_sealofsacrifice',
  Fishing: 'trade_fishing',
};

/** A profession's icon, or Wowhead's question mark for one this list doesn't know. */
export function professionIcon(
  name: string,
  size: 'small' | 'medium' | 'large' = 'medium',
): string {
  const icon = PROFESSION_ICONS[name] ?? 'inv_misc_questionmark';
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon}.jpg`;
}
