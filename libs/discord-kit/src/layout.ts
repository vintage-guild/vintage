// Components V2 layout: containers, text, sections, separators, thumbnails. A message sent with the
// IS_COMPONENTS_V2 flag is made only of components (no `content` or `embeds`), up to 40 of them
// counting nested ones. Text displays take Discord markdown, including custom emoji (<:name:id>).
import type { ActionRow, Button } from './components';

export const LayoutType = {
  SECTION: 9,
  TEXT_DISPLAY: 10,
  THUMBNAIL: 11,
  SEPARATOR: 14,
  CONTAINER: 17,
} as const;

export const LAYOUT_LIMITS = {
  /** Components in one message, nested ones included. */
  components: 40,
  /** Characters across every text display in one message. */
  text: 4000,
} as const;

export interface TextDisplay {
  type: typeof LayoutType.TEXT_DISPLAY;
  content: string;
}

export interface Thumbnail {
  type: typeof LayoutType.THUMBNAIL;
  media: { url: string };
  description?: string;
}

export interface Section {
  type: typeof LayoutType.SECTION;
  /** One to three text displays beside the accessory. */
  components: TextDisplay[];
  accessory: Thumbnail | Button;
}

export interface Separator {
  type: typeof LayoutType.SEPARATOR;
  /** Draw a line (default true); false leaves only space. */
  divider?: boolean;
  /** 1 small, 2 large. */
  spacing?: 1 | 2;
}

export type ContainerChild = TextDisplay | Section | Separator | ActionRow;

export interface Container {
  type: typeof LayoutType.CONTAINER;
  components: ContainerChild[];
  /** 0xRRGGBB stripe on the left edge. */
  accent_color?: number | null;
}

/** Anything that can sit at the top level of a V2 message. */
export type LayoutComponent = Container | TextDisplay | Section | Separator | ActionRow;

export function textDisplay(content: string): TextDisplay {
  if (content.length === 0) throw new Error('a text display needs content');
  return { type: LayoutType.TEXT_DISPLAY, content };
}

export function separator(options: { divider?: boolean; spacing?: 1 | 2 } = {}): Separator {
  return { type: LayoutType.SEPARATOR, ...options };
}

export function thumbnail(url: string, description?: string): Thumbnail {
  return { type: LayoutType.THUMBNAIL, media: { url }, ...(description ? { description } : {}) };
}

export function section(accessory: Thumbnail | Button, ...texts: TextDisplay[]): Section {
  if (texts.length === 0 || texts.length > 3) throw new Error('a section holds 1-3 text displays');
  return { type: LayoutType.SECTION, components: texts, accessory };
}

export function container(
  options: { accentColor?: number | null },
  ...children: ContainerChild[]
): Container {
  return {
    type: LayoutType.CONTAINER,
    components: children,
    ...(options.accentColor === undefined ? {} : { accent_color: options.accentColor }),
  };
}

/** Every component in a tree, for checking the 40-component limit. */
export function countComponents(components: readonly LayoutComponent[]): number {
  let n = 0;
  for (const c of components) {
    n += 1;
    if ('components' in c) n += countComponents(c.components as LayoutComponent[]);
    if (c.type === LayoutType.SECTION) n += 1; // the accessory
  }
  return n;
}

/** All text across text displays, for checking the 4000-character limit (and for tests). */
export function layoutText(components: readonly LayoutComponent[]): string {
  const parts: string[] = [];
  for (const c of components) {
    if (c.type === LayoutType.TEXT_DISPLAY) parts.push(c.content);
    else if ('components' in c) parts.push(layoutText(c.components as LayoutComponent[]));
  }
  return parts.filter(Boolean).join('\n');
}
