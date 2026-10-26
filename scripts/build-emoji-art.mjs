#!/usr/bin/env node
// Render Vintage's own emoji art into assets/emoji/*.png: outline status icons (Tabler Icons, MIT)
// tinted with our signup colors, and class-colored squares. scripts/discord-emojis.json points at
// these with `file:`; scripts/discord-emojis.mjs uploads them as the app's emoji.
//   node scripts/build-emoji-art.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'assets', 'emoji');
// The package doesn't export its package.json, so find its folder from the root install.
const TABLER = join(ROOT, 'node_modules', '@tabler', 'icons');
const SIZE = 128;

// Signup colors from libs/design-tokens (vintage-dark), bright enough for Discord's dark and light themes.
const COLOR = {
  going: '#6fcf5a',
  late: '#f0a05a',
  tentative: '#f0b44c',
  standby: '#8fb3d9',
  out: '#e8676b',
  neutral: '#9a9086',
};

const ICONS = {
  status_going: ['circle-check', COLOR.going],
  status_late: ['clock', COLOR.late],
  status_tentative: ['help-circle', COLOR.tentative],
  status_standby: ['armchair', COLOR.standby],
  status_out: ['circle-x', COLOR.out],
  status_queued: ['hourglass', COLOR.neutral],
  info_calendar: ['calendar', COLOR.neutral],
  info_open: ['lock-open', COLOR.neutral],
  info_locked: ['lock', COLOR.neutral],
  info_missing: ['alert-triangle', COLOR.late],
  head_tank: ['shield', COLOR.neutral],
  head_healer: ['heart', COLOR.neutral],
  head_dps: ['sword', COLOR.neutral],
};

// WoW's class colors.
const CLASSES = {
  warrior: '#C69B6D',
  paladin: '#F48CBA',
  hunter: '#AAD372',
  rogue: '#FFF468',
  priest: '#FFFFFF',
  shaman: '#0070DD',
  mage: '#3FC7EB',
  warlock: '#8788EE',
  druid: '#FF7C0A',
};

const png = (svg) => new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();

mkdirSync(OUT, { recursive: true });
for (const [name, [icon, color]] of Object.entries(ICONS)) {
  const svg = readFileSync(join(TABLER, 'icons', 'outline', `${icon}.svg`), 'utf8')
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/stroke-width="2"/g, 'stroke-width="2.25"');
  writeFileSync(join(OUT, `${name}.png`), png(svg));
}
for (const [cls, color] of Object.entries(CLASSES)) {
  // A rounded square with a thin dark edge, so light colors (priest white) show on light themes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3" fill="${color}" stroke="#00000055" stroke-width="0.75"/></svg>`;
  writeFileSync(join(OUT, `square_${cls}.png`), png(svg));
}
console.log(
  `Wrote ${Object.keys(ICONS).length + Object.keys(CLASSES).length} images to assets/emoji`,
);
