import { FASTElement, html } from '@lushly-dev/fast-element';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Not found</h1>
    <p class="lead">There's no page at this address. <a href="/">Back to the guild page</a>.</p>
  </div>
`;

export class Page extends FASTElement {}
await Page.define({ name: 'vintage-not-found-page', template, styles: pageStyles });
