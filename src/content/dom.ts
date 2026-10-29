// Shadow-DOM-aware DOM helpers. Sites built from web components (e.g.
// SmartRecruiters) keep their inputs inside open shadow roots, which
// querySelectorAll, closest() and parentElement don't cross.

/** All elements matching `selector` under `root`, including inside open shadow roots, in document order. */
export function deepQueryAll<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T[] {
  const out: T[] = [];
  const walk = (node: ParentNode) => {
    for (const child of node.children) {
      if (child.matches(selector)) out.push(child as T);
      if (child.shadowRoot) walk(child.shadowRoot);
      walk(child);
    }
  };
  walk(root);
  return out;
}

/** Parent element, stepping out of a shadow root to its host. */
export function parentOf(el: Element): HTMLElement | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
}

/** closest() that also searches past shadow-root boundaries. */
export function closestDeep<T extends Element = HTMLElement>(el: Element, selector: string): T | null {
  for (let node: Element | null = el; node; node = parentOf(node)) if (node.matches(selector)) return node as T;
  return null;
}

/** getElementById in the element's own tree (shadow root or document). */
export function byIdNear(el: Element, id: string): HTMLElement | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return (root.getElementById?.(id) as HTMLElement | null) ?? el.ownerDocument.getElementById(id);
}

/** The shadow host an element lives in, if any. */
export function hostOf(el: Element): HTMLElement | null {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
}

/** The real element an event started on, even when it came from inside a shadow root. */
export function eventTarget(e: Event): EventTarget | null {
  return e.composedPath()[0] ?? e.target;
}
