// The sticky header follows the page: as a page's sections scroll into view, it names the one
// the reader is in and offers that section's action. Pages mark sections with `data-section`
// attributes (see pages/home.ts) and call watchSections on them.

export interface SectionContext {
  eyebrow: string;
  title: string;
  actionLabel: string;
  actionHref: string;
  /** The section's element id, for the nav link that points at it. */
  sectionId?: string;
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

/**
 * Put a section's context on the header, and mark the nav link for it (`data-section-link`
 * names the section id; the hero is `top`, which the Home link carries).
 */
export function setSiteContext(context: SectionContext, root: ParentNode = document): void {
  const el = header(root);
  if (!el) return;
  el.contextEyebrow = context.eyebrow;
  el.contextTitle = context.title;
  el.actionLabel = context.actionLabel;
  el.actionHref = context.actionHref;
  if (!context.sectionId) return;
  for (const link of el.querySelectorAll<HTMLAnchorElement>('a[data-section-link]')) {
    if (link.dataset.sectionLink === context.sectionId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/** Read a section's context from its `data-section-*` attributes. */
export function sectionContext(section: Element): SectionContext {
  const d = (section as HTMLElement).dataset;
  return {
    eyebrow: d.sectionEyebrow ?? '',
    title: d.sectionTitle ?? '',
    actionLabel: d.sectionAction ?? '',
    actionHref: d.sectionHref ?? (section.id ? `#${section.id}` : ''),
    sectionId: section.id || undefined,
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

/* ---- section links -----------------------------------------------------------------------
 * The home page's sections live inside its shadow root, so a plain `#raids` fragment finds
 * nothing, and the router would read `/#raids` as a route. Links carry `data-section-link`
 * with the section id (`top` for the hero); clicks are taken before the router and scrolled
 * here. Off the home page, the link navigates home first and scrolls once the page mounts.
 */

const HOME_TAG = 'vintage-home-page';
let pendingSection: string | null = null;

const homePage = () => document.querySelector(HOME_TAG);

/** Scroll the home page to a section. False when the home page is not mounted. */
export function scrollToSection(id: string, behavior: ScrollBehavior = 'smooth'): boolean {
  const page = homePage();
  if (!page) return false;
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior });
    return true;
  }
  const section = page.shadowRoot?.getElementById(id);
  if (!section) return false;
  section.scrollIntoView({ behavior, block: 'start' });
  return true;
}

/** Go to a section: scroll now, or navigate home and scroll when it mounts. */
export function goToSection(id: string): void {
  if (scrollToSection(id)) return;
  pendingSection = id;
  history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** The section a navigation asked for, once; the home page calls this when it mounts. */
export function consumePendingSection(): string | null {
  const id = pendingSection;
  pendingSection = null;
  return id;
}

/** The section link in an event's path, if any (works across shadow roots). */
export function sectionLinkIn(event: Event): string | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement && node.dataset.sectionLink) {
      return node.dataset.sectionLink;
    }
  }
  return null;
}

/** Take section-link clicks before the router. Returns a stop function. */
export function installSectionLinks(root: EventTarget = window): () => void {
  const onClick = (event: Event) => {
    const mouse = event as MouseEvent;
    if (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)
      return;
    const id = sectionLinkIn(event);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goToSection(id);
  };
  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
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
