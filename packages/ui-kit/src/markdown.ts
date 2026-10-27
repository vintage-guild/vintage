// The little markdown an agent answer uses (paragraphs, lists, bold, italics, code, links), built
// as DOM nodes from text. No HTML is ever parsed, so nothing in an answer can become markup, a
// script, or a handler: every character lands in a text node. Links must be https.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'br' };

export type Block =
  | { type: 'p'; inlines: Inline[] }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'code'; text: string };

const LINK = /^\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,4}\s+(.*)$/;

/** The text up to the next `marker` after `from`, or null when it never closes. */
function closing(s: string, from: number, marker: string): number | null {
  const at = s.indexOf(marker, from);
  return at > from ? at : null;
}

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

/** One inline span starting at `i`, or null when `s[i]` is plain text. */
function span(s: string, i: number): { inline: Inline; end: number } | null {
  if (s[i] === '`') {
    const end = closing(s, i + 1, '`');
    if (end !== null) return { inline: { type: 'code', text: s.slice(i + 1, end) }, end: end + 1 };
  }
  if (s.startsWith('**', i)) {
    const end = closing(s, i + 2, '**');
    if (end !== null) {
      return {
        inline: { type: 'strong', children: parseInline(s.slice(i + 2, end)) },
        end: end + 2,
      };
    }
  }
  if ((s[i] === '*' || s[i] === '_') && s[i + 1] !== ' ') {
    const end = closing(s, i + 1, s[i] as string);
    if (end !== null) {
      return { inline: { type: 'em', children: parseInline(s.slice(i + 1, end)) }, end: end + 1 };
    }
  }
  if (s[i] === '[') {
    const m = LINK.exec(s.slice(i));
    if (m) {
      const [whole, label, href] = m as unknown as [string, string, string];
      return {
        inline: { type: 'link', href, children: parseInline(label) },
        end: i + whole.length,
      };
    }
  }
  return null;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < s.length) {
    const found = span(s, i);
    if (found) {
      out.push(found.inline);
      i = found.end;
    } else {
      pushText(out, s[i] as string);
      i++;
    }
  }
  return out;
}

/** Paragraph lines join with line breaks, as chat answers expect. */
function paragraph(lines: string[]): Block {
  const inlines: Inline[] = [];
  lines.forEach((line, n) => {
    if (n > 0) inlines.push({ type: 'br' });
    inlines.push(...parseInline(line));
  });
  return { type: 'p', inlines };
}

/** Reads lines into blocks: fenced code, lists, headings, and paragraphs. */
class BlockReader {
  readonly blocks: Block[] = [];
  private para: string[] = [];
  private code: string[] | null = null;

  line(line: string): void {
    if (line.trim().startsWith('```')) {
      this.fence();
      return;
    }
    if (this.code) {
      this.code.push(line);
      return;
    }
    if (this.listItem(line)) return;
    const heading = HEADING.exec(line);
    if (heading) {
      this.flush();
      this.blocks.push({ type: 'heading', inlines: parseInline(heading[1] ?? '') });
    } else if (!line.trim()) {
      this.flush();
    } else {
      this.para.push(line.trim());
    }
  }

  end(): Block[] {
    if (this.code) this.fence();
    this.flush();
    return this.blocks;
  }

  private fence(): void {
    this.flush();
    if (this.code) {
      this.blocks.push({ type: 'code', text: this.code.join('\n') });
      this.code = null;
    } else {
      this.code = [];
    }
  }

  private listItem(line: string): boolean {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const match = bullet ?? numbered;
    if (!match) return false;
    this.flush();
    const type = bullet ? 'ul' : 'ol';
    const item = parseInline(match[1] ?? '');
    const last = this.blocks[this.blocks.length - 1];
    if (last && 'items' in last && last.type === type) last.items.push(item);
    else this.blocks.push({ type, items: [item] });
    return true;
  }

  private flush(): void {
    if (this.para.length) this.blocks.push(paragraph(this.para));
    this.para = [];
  }
}

export function parseMarkdown(text: string): Block[] {
  const reader = new BlockReader();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) reader.line(line);
  return reader.end();
}

function inlineNodes(doc: Document, inlines: readonly Inline[], into: Node) {
  for (const inline of inlines) {
    if (inline.type === 'text') into.appendChild(doc.createTextNode(inline.text));
    else if (inline.type === 'br') into.appendChild(doc.createElement('br'));
    else if (inline.type === 'code') {
      const code = doc.createElement('code');
      code.textContent = inline.text;
      into.appendChild(code);
    } else if (inline.type === 'link') {
      const a = doc.createElement('a');
      a.href = inline.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      inlineNodes(doc, inline.children, a);
      into.appendChild(a);
    } else {
      const el = doc.createElement(inline.type);
      inlineNodes(doc, inline.children, el);
      into.appendChild(el);
    }
  }
}

function blockNode(doc: Document, block: Block): Node {
  if ('items' in block) {
    const list = doc.createElement(block.type);
    for (const item of block.items) {
      const li = doc.createElement('li');
      inlineNodes(doc, item, li);
      list.appendChild(li);
    }
    return list;
  }
  if (block.type === 'code') {
    const pre = doc.createElement('pre');
    const code = doc.createElement('code');
    code.textContent = block.text;
    pre.appendChild(code);
    return pre;
  }
  const el = doc.createElement('p');
  if (block.type === 'heading') el.className = 'heading';
  inlineNodes(doc, block.inlines, el);
  return el;
}

/** The answer as DOM nodes. Only element names chosen here are ever created. */
export function renderMarkdown(text: string, doc: Document = document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const block of parseMarkdown(text)) fragment.appendChild(blockNode(doc, block));
  return fragment;
}
