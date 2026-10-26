import { Updates } from '@lushly-dev/fast-element';

/** Mount an element, let FAST render, and return it. */
export async function mount<T extends HTMLElement>(markup: string): Promise<T> {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.append(host);
  await settle();
  return host.firstElementChild as T;
}

/** Wait for FAST's update queue (bindings, attribute reflection) to flush. */
export async function settle(): Promise<void> {
  await Updates.next();
  await Updates.next();
}

/** The element's rendered shadow text, whitespace collapsed. */
export function shadowText(el: Element): string {
  return (el.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function cleanup(): void {
  document.body.replaceChildren();
}
