import { describe, expect, it } from 'vitest';
import { parseMarkdown, renderMarkdown } from './markdown';

const html = (text: string) => {
  const box = document.createElement('div');
  box.append(renderMarkdown(text));
  return box.innerHTML;
};

describe('renderMarkdown', () => {
  it('renders what agent answers use: paragraphs, lists, bold, italics, code, links', () => {
    expect(
      html(
        '**Signed up:**\n- Aeryn\n- Kol\n\n1. first\n2. `code`\n\n_Note_ with [the site](https://vintageguild.gg/apply).',
      ),
    ).toBe(
      '<p><strong>Signed up:</strong></p><ul><li>Aeryn</li><li>Kol</li></ul><ol><li>first</li><li><code>code</code></li></ol>' +
        '<p><em>Note</em> with <a href="https://vintageguild.gg/apply" target="_blank" rel="noopener noreferrer">the site</a>.</p>',
    );
  });

  it('never turns text into markup, scripts, or handlers', () => {
    const out = html('<img src=x onerror="alert(1)"> <script>alert(2)</script> **<b>bold</b>**');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;img src=x onerror="alert(1)"&gt;');
  });

  it('keeps only https links; anything else stays text', () => {
    for (const href of ['javascript:alert(1)', 'http://plain.example', 'data:text/html,x']) {
      const out = html(`[click](${href})`);
      expect(out).not.toContain('<a');
      expect(out).toContain('[click]');
    }
  });

  it('joins a paragraph’s lines with breaks and keeps fenced code as written', () => {
    expect(parseMarkdown('one\ntwo')).toEqual([
      {
        type: 'p',
        inlines: [{ type: 'text', text: 'one' }, { type: 'br' }, { type: 'text', text: 'two' }],
      },
    ]);
    expect(html('```\n**not bold** <i>\n```')).toBe(
      '<pre><code>**not bold** &lt;i&gt;</code></pre>',
    );
  });
});
