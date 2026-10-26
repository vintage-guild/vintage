/**
 * Blizzard's class icon on Wowhead's image CDN, the same icons the bot's emoji use. Loaded, never
 * committed (assets/emoji/README.md); the Privacy page says the browser fetches them from Wowhead.
 * Sizes: small 18px, medium 36px, large 56px.
 */
export function classIcon(wowClass: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const slug = wowClass.toLowerCase().replace(/[^a-z]/g, '');
  return `https://wow.zamimg.com/images/wow/icons/${size}/classicon_${slug}.jpg`;
}
