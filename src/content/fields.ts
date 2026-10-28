// Finds fillable fields on the page and works out each one's question text.
import type { FieldDescriptor, FieldKind, ProfileKey } from '../shared/matcher';
import type { Adapter } from './adapters/types';

export interface FieldHandle {
  kind: FieldKind;
  /** Primary element: input / select / textarea / combobox trigger / first radio. */
  el: HTMLElement;
  /** Radio inputs, or choice buttons (e.g. Ashby Yes/No), in option order. */
  choices?: HTMLElement[];
  /** Element the highlight is drawn around. */
  anchor: HTMLElement;
  label: string;
  attrs: string;
  autocomplete?: string;
  options?: string[];
  required: boolean;
  hint?: ProfileKey;
  section?: 'work' | 'education';
  /** 0-based work/education entry index, when the adapter knows it. */
  index?: number;
}

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color']);

export function text(el: Element | null | undefined): string {
  if (!el) return '';
  // Clone so we can drop nested controls (a wrapping <label> includes <option> text).
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('input, select, textarea, option, button, script, style, svg, [aria-hidden="true"]').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return el.getClientRects().length > 0;
}

function byIds(ids: string | null, doc: Document): string {
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => text(doc.getElementById(id)))
    .filter(Boolean)
    .join(' ');
}

const LABELISH = 'label, legend, [class*="label" i], [class*="question" i], [class*="title" i], h2, h3, h4, h5, p, span, div';

/** Text immediately before the field inside its nearest container. */
function nearbyText(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  for (let depth = 0; depth < 4 && node; depth++) {
    let sib = node.previousElementSibling as HTMLElement | null;
    for (let i = 0; i < 3 && sib; i++, sib = sib.previousElementSibling as HTMLElement | null) {
      if (sib.matches('input, select, textarea, button')) break;
      const t = sib.matches(LABELISH) ? text(sib) : '';
      if (t && t.length <= 300) return t;
    }
    node = node.parentElement;
    if (node && node.querySelectorAll('input, select, textarea').length > 3) break;
  }
  return '';
}

export function labelFor(el: HTMLElement, adapter: Adapter): string {
  const doc = el.ownerDocument;
  const fromAdapter = adapter.label?.(el);
  if (fromAdapter) return fromAdapter;

  const labelledBy = byIds(el.getAttribute('aria-labelledby'), doc);
  if (labelledBy) return labelledBy;

  if ('labels' in el) {
    const labels = (el as HTMLInputElement).labels;
    const t = labels ? [...labels].map((l) => text(l)).filter(Boolean).join(' ') : '';
    if (t) return t;
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();

  const legend = el.closest('fieldset')?.querySelector('legend');
  if (legend && (el as HTMLInputElement).type === 'radio') return text(legend);

  return nearbyText(el) || el.getAttribute('placeholder') || el.getAttribute('title') || '';
}

/** Question text for a radio group: the fieldset legend or the container's label. */
function groupLabel(radios: HTMLInputElement[], adapter: Adapter): string {
  const first = radios[0];
  const fromAdapter = adapter.label?.(first);
  if (fromAdapter) return fromAdapter;
  const group = first.closest('[role="radiogroup"], fieldset');
  if (group) {
    const t = byIds(group.getAttribute('aria-labelledby'), first.ownerDocument) || group.getAttribute('aria-label') || text(group.querySelector('legend'));
    if (t) return t;
  }
  // Walk up until the container holds the whole group, then look just before it.
  let container: HTMLElement | null = first.parentElement;
  while (container && !radios.every((r) => container!.contains(r))) container = container.parentElement;
  return container ? nearbyText(container) || text(container.querySelector('label:not(:has(input))')) : '';
}

function optionLabel(input: HTMLInputElement): string {
  return (input.labels && input.labels[0] ? text(input.labels[0]) : '') || input.getAttribute('aria-label') || input.value;
}

function attrsOf(el: Element): string {
  return [el.getAttribute('name'), el.id, el.getAttribute('data-automation-id'), el.getAttribute('data-qa')].filter(Boolean).join(' ');
}

function kindOf(el: HTMLElement): FieldKind | undefined {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') return 'combobox';
    const t = el.type.toLowerCase();
    if (SKIP_INPUT_TYPES.has(t)) return undefined;
    if (t === 'radio' || t === 'checkbox' || t === 'file' || t === 'email' || t === 'tel' || t === 'url' || t === 'number' || t === 'date' || t === 'month') return t;
    return 'text';
  }
  if (el.matches('[role="combobox"], button[aria-haspopup="listbox"]')) return 'combobox';
  return undefined;
}

const SECTION_HEADING = 'h1, h2, h3, h4, h5, legend, [role="heading"], [class*="heading" i], [class*="section-title" i]';

/** Work/education context from the nearest section heading above the field. */
function sectionOf(el: HTMLElement): 'work' | 'education' | undefined {
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
    const prev = node.previousElementSibling;
    const heading = [...node.children].find((c) => c.matches(SECTION_HEADING)) ?? (prev?.matches(SECTION_HEADING) ? prev : null);
    const t = heading ? text(heading).toLowerCase() : '';
    if (!t || t.length > 60) continue;
    if (/experience|employment|work history|positions?/.test(t)) return 'work';
    if (/education|school|degree/.test(t)) return 'education';
    return undefined; // nearest heading is about something else
  }
  return undefined;
}

/** The form-like container with the most fields, so we skip site search boxes etc. */
function formRoot(doc: Document, adapter: Adapter): ParentNode {
  const custom = adapter.root?.(doc);
  if (custom) return custom;
  const forms = [...doc.querySelectorAll('form')]
    .map((f) => ({ f, n: f.querySelectorAll('input:not([type=hidden]), select, textarea').length }))
    .sort((a, b) => b.n - a.n);
  return forms[0] && forms[0].n >= 3 ? forms[0].f : doc.body;
}

export function collectFields(doc: Document, adapter: Adapter): FieldHandle[] {
  const root = formRoot(doc, adapter);
  const out: FieldHandle[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  const candidates = root.querySelectorAll<HTMLElement>(
    'input, select, textarea, [role="combobox"]:not(input), button[aria-haspopup="listbox"]',
  );
  for (const el of candidates) {
    if (el.closest('header, nav, [role="search"], [role="navigation"], footer, [data-job-helper]')) continue;
    if (adapter.skip?.(el)) continue;
    const kind = kindOf(el);
    if (!kind) continue;
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue;
    // A combobox input inside a combobox container we already took (e.g. Workday).
    if (kind === 'combobox' && el instanceof HTMLInputElement && el.closest('[role="combobox"]:not(input)')) continue;

    // Hidden inputs behind custom UI: file inputs and styled radios/checkboxes.
    const hiddenOk = kind === 'file' || kind === 'radio' || kind === 'checkbox';
    if (!hiddenOk && !isVisible(el)) continue;

    if (kind === 'radio') {
      const input = el as HTMLInputElement;
      const key = input.name || `__${out.length}`;
      if (!radioGroups.has(key)) {
        radioGroups.set(key, []);
        out.push({ kind, el, anchor: el, label: '', attrs: attrsOf(el), required: false, choices: radioGroups.get(key) });
      }
      radioGroups.get(key)!.push(input);
      continue;
    }

    const label = labelFor(el, adapter);
    if (/\bsearch\b/i.test(label) && kind !== 'combobox') continue;
    const anchor = hiddenOk && !isVisible(el) ? visibleAncestor(el) : el;
    if (!anchor) continue;
    out.push({
      kind,
      el,
      anchor,
      label,
      attrs: attrsOf(el),
      autocomplete: el.getAttribute('autocomplete') ?? undefined,
      options: el instanceof HTMLSelectElement ? [...el.options].map((o) => o.text.trim()) : undefined,
      required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
    });
  }

  // Finish radio groups now that every member is known.
  for (const f of out) {
    if (f.kind !== 'radio' || !f.choices) continue;
    const radios = f.choices as HTMLInputElement[];
    f.label = groupLabel(radios, adapter);
    f.options = radios.map(optionLabel);
    f.required = radios.some((r) => r.required || r.getAttribute('aria-required') === 'true');
    f.anchor = visibleAncestor(radios[0].closest('[role="radiogroup"], fieldset') as HTMLElement ?? radios[0]) ?? radios[0];
    if (radios.length > 1) {
      let c: HTMLElement | null = radios[0].parentElement;
      while (c && !radios.every((r) => c!.contains(r))) c = c.parentElement;
      if (c) f.anchor = c;
    }
  }

  out.push(...(adapter.extraFields?.(root) ?? []));

  for (const f of out) {
    const extra = adapter.describe?.(f);
    if (extra) Object.assign(f, extra);
    f.section ??= sectionOf(f.el);
  }
  return out.filter((f) => f.kind !== 'radio' || (f.choices && f.choices.length > 0));
}

export function visibleAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  for (let i = 0; i < 5 && node; i++, node = node.parentElement) if (isVisible(node)) return node;
  return null;
}

export function toDescriptor(f: FieldHandle): FieldDescriptor {
  return {
    label: f.label,
    kind: f.kind,
    attrs: f.attrs,
    autocomplete: f.autocomplete,
    options: f.options,
    hint: f.hint,
    required: f.required,
  };
}
