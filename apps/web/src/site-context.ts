// The sticky header follows the page: as a page's sections scroll into view, it names the one
// the reader is in and offers that section's action. Pages mark sections with `data-section`
// attributes (see pages/home.ts) and call watchSections on them.

export interface SectionContext {
  eyebrow: string;
  title: string;
  actionLabel: string;
  actionHref: string;
}

type HeaderElement = HTMLElement & {
  contextEyebrow: string;
  contextTitle: string;
  actionLabel: string;
  actionHref: string;
  progress: number | null;
};

const header = (root: ParentNode = document) =>
  root.querySelector<HeaderElement>('vintage-logo-header');

/** Put a section's context on the header. */
export function setSiteContext(context: SectionContext, root: ParentNode = document): void {
  const el = header(root);
  if (!el) return;
  el.contextEyebrow = context.eyebrow;
  el.contextTitle = context.title;
  el.actionLabel = context.actionLabel;
  el.actionHref = context.actionHref;
}

/** Read a section's context from its `data-section-*` attributes. */
export function sectionContext(section: Element): SectionContext {
  const d = (section as HTMLElement).dataset;
  return {
    eyebrow: d.sectionEyebrow ?? '',
    title: d.sectionTitle ?? '',
    actionLabel: d.sectionAction ?? '',
    actionHref: d.sectionHref ?? (section.id ? `#${section.id}` : ''),
  };
}

/**
 * Report the first section at once, then the one around the top third of the viewport as
 * the reader scrolls. Returns a stop function.
 */
export function watchSections(
  sections: Iterable<Element>,
  onEnter: (section: Element) => void,
): () => void {
  const list = [...sections];
  if (list[0]) onEnter(list[0]);
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) onEnter(entry.target);
    },
    { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
  );
  for (const section of list) observer.observe(section);
  return () => observer.disconnect();
}

/** Keep the header's progress line in step with the page scroll. Returns a stop function. */
export function trackScrollProgress(root: ParentNode = document): () => void {
  const el = header(root);
  if (!el) return () => {};
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    el.progress = max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
  return () => window.removeEventListener('scroll', update);
}
