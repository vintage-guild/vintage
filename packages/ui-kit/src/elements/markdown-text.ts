import { css, FASTElement, html, observable } from '@lushly-dev/fast-element';
import { renderMarkdown } from '../markdown';

const template = html<VintageMarkdown>`<div class="md" part="markdown"></div>`;

const styles = css`
  :host {
    display: block;
    color: inherit;
    line-height: var(--font-line-height-normal);
  }
  .md > :first-child {
    margin-block-start: 0;
  }
  .md > :last-child {
    margin-block-end: 0;
  }
  p,
  ul,
  ol,
  pre {
    margin-block: 0 var(--space-sm);
  }
  ul,
  ol {
    padding-inline-start: var(--space-lg);
  }
  .heading {
    font-weight: var(--font-weight-semibold);
  }
  code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    padding: 0 var(--space-xs);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
  }
  pre {
    overflow-x: auto;
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
  }
  a {
    color: var(--color-text-link);
  }
`;

/**
 * Markdown text an agent wrote, as DOM nodes built from text (`renderMarkdown`): paragraphs,
 * lists, bold, italics, code, and https links. Nothing in `text` is ever parsed as HTML.
 *
 * @tagname vintage-markdown
 * @summary Safe markdown for agent answers.
 * @csspart markdown - The rendered text.
 */
export class VintageMarkdown extends FASTElement {
  @observable text = '';

  textChanged(): void {
    this.render();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.render();
  }

  private render(): void {
    const box = this.shadowRoot?.querySelector('.md');
    if (!box) return;
    box.replaceChildren(renderMarkdown(this.text ?? '', this.ownerDocument));
  }
}

if (!customElements.get('vintage-markdown')) {
  await VintageMarkdown.define({ name: 'vintage-markdown', template, styles });
}
