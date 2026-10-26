import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageFigure } from './figure';
import './figure';
import type { VintageHero } from './hero';
import './hero';
import type { VintageLogoHeader } from './logo-header';
import './logo-header';

afterEach(cleanup);

describe('vintage-hero', () => {
  it('renders the art as decorative and exposes the content slots', async () => {
    const el = await mount<VintageHero>(
      '<vintage-hero art-src="/art/x.webp"><h1>Forming</h1><p slot="standfirst">Soon.</p></vintage-hero>',
    );
    const img = el.shadowRoot!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/art/x.webp');
    expect(img.getAttribute('alt')).toBe('');
    expect(el.shadowRoot!.querySelector('.art')?.getAttribute('aria-hidden')).toBe('true');
    const slots = [...el.shadowRoot!.querySelectorAll('slot')].map((s) => s.getAttribute('name'));
    expect(slots).toEqual(['eyebrow', null, 'standfirst', 'actions', 'figures']);
  });

  it('renders no art without a source', async () => {
    const el = await mount<VintageHero>('<vintage-hero><h1>Plain</h1></vintage-hero>');
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
  });

  it('offers the phone art as a source for narrow screens only when given', async () => {
    const plain = await mount<VintageHero>('<vintage-hero art-src="/art/x.webp"></vintage-hero>');
    expect(plain.shadowRoot!.querySelector('source')).toBeNull();
    // The phone fade keys off a class, since the reflected attribute is present even when empty.
    expect(plain.shadowRoot!.querySelector('.art.phone')).toBeNull();

    const el = await mount<VintageHero>(
      '<vintage-hero art-src="/art/x.webp" art-phone-src="/art/x-phone.webp"><h1>Forming</h1></vintage-hero>',
    );
    const source = el.shadowRoot!.querySelector('picture > source')!;
    expect(source.getAttribute('srcset')).toBe('/art/x-phone.webp');
    expect(source.getAttribute('media')).toBe('(max-width: 40rem)');
    expect(el.shadowRoot!.querySelector('.art.phone')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('picture > img')?.getAttribute('src')).toBe('/art/x.webp');
  });
});

describe('vintage-figure', () => {
  it('shows the value, unit, and caption', async () => {
    const el = await mount<VintageFigure>(
      '<vintage-figure value="10" unit="days" caption="to launch" tone="good"></vintage-figure>',
    );
    expect(shadowText(el)).toBe('10days to launch');
    expect(el.getAttribute('tone')).toBe('good');
  });
});

describe('vintage-logo-header context', () => {
  it('shows the section context and action only when set', async () => {
    const el = await mount<VintageLogoHeader>(
      '<vintage-logo-header heading=""></vintage-logo-header>',
    );
    expect(el.shadowRoot!.querySelector('.context')).toBeNull();
    expect(el.shadowRoot!.querySelector('.action')).toBeNull();
    expect(shadowText(el)).toBe('');

    el.contextEyebrow = 'Raids';
    el.contextTitle = 'Next on the calendar';
    el.actionLabel = 'Sign up';
    el.actionHref = '#raids';
    el.progress = 42;
    await settle();
    expect(shadowText(el)).toBe('Raids Next on the calendar Sign up');
    expect(el.shadowRoot!.querySelector('.action')?.getAttribute('href')).toBe('#raids');
    expect(el.shadowRoot!.querySelector('.progress')?.getAttribute('style')).toBe(
      'inline-size: 42%',
    );
  });

  it('clamps progress', async () => {
    const el = await mount<VintageLogoHeader>(
      '<vintage-logo-header progress="140"></vintage-logo-header>',
    );
    expect(el.progressWidth).toBe('100%');
  });
});
