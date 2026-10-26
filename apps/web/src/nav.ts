/** Mark the header link for `path` with aria-current="page" and clear the rest. */
export function markCurrentLink(path: string, root: ParentNode = document): void {
  const current = normalize(path);
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    'vintage-logo-header > a:not([slot])',
  )) {
    if (normalize(link.getAttribute('href') ?? '') === current)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const normalize = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`;
