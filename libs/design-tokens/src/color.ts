/** RGBA channels in 0–1, the shape FenUI and most canvas APIs take. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

/** Parse `#rrggbb` or `#rrggbbaa` into 0–1 channels. */
export function parseHex(hex: string): Rgba {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb[aa] color: ${hex}`);
  const rgb = match[1]!;
  const channel = (i: number) => Number.parseInt(rgb.slice(i, i + 2), 16) / 255;
  const alpha = match[2] === undefined ? 1 : Number.parseInt(match[2], 16) / 255;
  return [channel(0), channel(2), channel(4), alpha];
}

/** WCAG 2.x relative luminance of an opaque color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b, a] = parseHex(hex);
  if (a !== 1) throw new Error(`contrast needs an opaque color, got ${hex}`);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two opaque colors (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 24-bit integer for a color (alpha dropped), the form Discord embeds take. */
export function hexToInt(hex: string): number {
  parseHex(hex);
  return Number.parseInt(hex.slice(1, 7), 16);
}
