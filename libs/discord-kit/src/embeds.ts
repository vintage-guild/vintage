// Embeds: typed and minimal. `embed()` trims to Discord's limits so a long roster or digest
// degrades to a truncated message instead of a 400 from the API.

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  /** ISO-8601 timestamp shown in the footer. */
  timestamp?: string;
  /** 0xRRGGBB. */
  color?: number;
  footer?: { text: string; icon_url?: string };
  author?: { name: string; url?: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: EmbedField[];
}

export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
} as const;

/** Shorten `text` to `max` characters, ending with an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const clip = (text: string | undefined, max: number) =>
  text === undefined ? undefined : truncate(text, max);

/** Build an embed clipped to Discord's limits. Undefined keys are dropped. */
export function embed(input: Embed): Embed {
  const out: Embed = {
    ...input,
    title: clip(input.title, EMBED_LIMITS.title),
    description: clip(input.description, EMBED_LIMITS.description),
    footer: input.footer && {
      ...input.footer,
      text: truncate(input.footer.text, EMBED_LIMITS.footerText),
    },
    author: input.author && {
      ...input.author,
      name: truncate(input.author.name, EMBED_LIMITS.authorName),
    },
    fields: input.fields?.slice(0, EMBED_LIMITS.fields).map((f) => ({
      ...f,
      name: truncate(f.name, EMBED_LIMITS.fieldName),
      value: truncate(f.value, EMBED_LIMITS.fieldValue),
    })),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Embed;
}
