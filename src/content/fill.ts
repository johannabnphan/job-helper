// Low-level value setters that work with React/Angular/Vue-controlled inputs.
// Job Helper never submits: every click goes through safeClick, which refuses
// anything that could submit or advance the form.
import { pickBestOption, type OptionPick } from '../shared/matcher';
import { byIdNear, deepQueryAll, hostOf } from './dom';
import { isVisible, text } from './fields';

const SUBMIT_TEXT = /\b(submit|apply|send|finish|continue|next|save and continue|review application|done)\b/i;

/** True when clicking `el` could submit the form or move to another step. */
export function couldSubmit(el: HTMLElement): boolean {
  const btn = el.closest('button, input[type="submit"], input[type="image"], [role="button"], a') as HTMLElement | null;
  if (!btn) return false;
  if (btn instanceof HTMLInputElement) return btn.type === 'submit' || btn.type === 'image';
  if (btn instanceof HTMLButtonElement) {
    // A <button> with no type inside a form defaults to type="submit".
    const type = (btn.getAttribute('type') ?? (btn.form ? 'submit' : 'button')).toLowerCase();
    if (type === 'submit') return true;
  }
  if (btn instanceof HTMLAnchorElement && btn.href && !btn.href.startsWith('javascript:') && !btn.getAttribute('href')?.startsWith('#')) return true;
  // A button inside a web component shows its host's slotted text ("Submit").
  const host = btn.querySelector('slot') ? hostOf(btn) : null;
  if (host && /submit/i.test(host.getAttribute('kind') ?? host.getAttribute('type') ?? '')) return true;
  return SUBMIT_TEXT.test(text(btn) || (host ? text(host) : '') || btn.getAttribute('aria-label') || '');
}

export function safeClick(el: HTMLElement): boolean {
  if (couldSubmit(el)) {
    console.warn('[Job Helper] refused to click a control that could submit the form', el);
    return false;
  }
  const opts = { bubbles: true, cancelable: true, view: window } as const;
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
  return true;
}

function nativeSetter(el: HTMLElement): ((v: string) => void) | undefined {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  return setter ? (v) => setter.call(el, v) : undefined;
}

function fire(el: HTMLElement, ...types: string[]): void {
  // composed: let the event out of shadow roots so web components see it.
  for (const t of types) el.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
}

/** Sets a value the way a framework expects to see a user type it. */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  el.focus({ preventScroll: true });
  const set = nativeSetter(el);
  if (set) set(value);
  else el.value = value;
  fire(el, 'input', 'change');
  el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
}

export function hasValue(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return Boolean(opt && opt.value && el.selectedIndex > 0);
  }
  if (el instanceof HTMLInputElement && el.type === 'file') return Boolean(el.files && el.files.length);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim() !== '';
  return false;
}

/** `wordings`: the value first, then alternate wordings (answer variants). */
export function setSelect(el: HTMLSelectElement, wordings: string[]): OptionPick | undefined {
  const options = [...el.options];
  const pick = pickBestOption(options.map((o) => o.text), wordings) ?? pickBestOption(options.map((o) => o.value), wordings);
  if (!pick) return undefined;
  setValue(el, options[pick.index].value);
  return pick;
}

export function setRadio(radios: HTMLInputElement[], labels: string[], wordings: string[]): OptionPick | undefined {
  const pick = pickBestOption(labels, wordings);
  if (!pick) return undefined;
  const radio = radios[pick.index];
  if (!radio.checked) {
    const target = radio.labels?.[0] && !isVisible(radio) ? radio.labels[0] : radio;
    safeClick(target as HTMLElement);
    if (!radio.checked) {
      radio.checked = true;
      fire(radio, 'input', 'change');
    }
  }
  return pick;
}

export function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  if (el.checked === checked) return;
  const target = el.labels?.[0] && !isVisible(el) ? el.labels[0] : el;
  safeClick(target as HTMLElement);
  if (el.checked !== checked) {
    el.checked = checked;
    fire(el, 'input', 'change');
  }
}

export function setButtonChoice(buttons: HTMLElement[], wordings: string[]): OptionPick | undefined {
  const pick = pickBestOption(buttons.map((b) => text(b)), wordings);
  if (!pick) return undefined;
  const btn = buttons[pick.index];
  if (btn.getAttribute('aria-pressed') !== 'true' && !btn.className.match(/active|selected/)) {
    if (!safeClick(btn)) return undefined;
  }
  return pick;
}

export function setFile(input: HTMLInputElement, file: File): boolean {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    fire(input, 'input', 'change');
    // Some dropzones listen for a drop on their container instead.
    if (!input.files?.length) {
      const zone = input.parentElement;
      zone?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    return true;
  } catch (err) {
    console.warn('[Job Helper] could not attach file', err);
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visibleOptions(doc: Document, owner: HTMLElement): HTMLElement[] {
  const listId = owner.getAttribute('aria-controls') || owner.getAttribute('aria-owns');
  const scope = (listId && byIdNear(owner, listId)) || doc;
  return deepQueryAll<HTMLElement>(scope, '[role="option"], [id*="-option-"], .select__option').filter(
    (o) => isVisible(o) && !o.closest('[data-job-helper]'),
  );
}

async function waitForOptions(doc: Document, owner: HTMLElement, timeout = 2000): Promise<HTMLElement[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const opts = visibleOptions(doc, owner);
    if (opts.length) return opts;
    await sleep(100);
  }
  return [];
}

function closeMenu(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
}

/**
 * Custom dropdowns (react-select on Greenhouse, Ashby, Workday). Opens the
 * menu, types to filter when it's an input, and clicks the best option.
 * Tries a full query, then the first word, then no filter at all, because
 * the site's own filtering may not match our wording ("BFA" vs "Bachelor's").
 * Returns undefined when no suitable option appears.
 */
export async function setCombobox(el: HTMLElement, wordings: string[]): Promise<(OptionPick & { label: string }) | undefined> {
  const value = wordings[0];
  const doc = el.ownerDocument;
  const label = (o: HTMLElement) => text(o) || o.getAttribute('aria-label') || '';

  if (!(el instanceof HTMLInputElement)) {
    if (!safeClick(el)) return undefined;
    const options = await waitForOptions(doc, el);
    const pick = options.length ? pickBestOption(options.map(label), wordings) : undefined;
    if (!pick) {
      closeMenu(el);
      return undefined;
    }
    const chosen = label(options[pick.index]);
    safeClick(options[pick.index]);
    await sleep(150);
    return { ...pick, label: chosen };
  }

  el.focus();
  safeClick(el);
  const head = value.split(',')[0].trim().slice(0, 40);
  const queries = [...new Set([head, head.split(/\s+/)[0], ''])];
  for (const query of queries) {
    setValueKeepFocus(el, query);
    let options = await waitForOptions(doc, el, query ? 2000 : 1000);
    if (!options.length) {
      // Some menus only open on ArrowDown.
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
      options = await waitForOptions(doc, el, 600);
    }
    const pick = options.length ? pickBestOption(options.map(label), wordings) : undefined;
    if (pick) {
      const chosen = label(options[pick.index]);
      safeClick(options[pick.index]);
      await sleep(150);
      if (visibleOptions(doc, el).length) closeMenu(el);
      return { ...pick, label: chosen };
    }
  }
  setValueKeepFocus(el, '');
  closeMenu(el);
  return undefined;
}

function setValueKeepFocus(el: HTMLInputElement, value: string): void {
  const set = nativeSetter(el);
  if (set) set(value);
  else el.value = value;
  fire(el, 'input');
}

/** Displayed value of a custom dropdown, used to avoid overwriting a choice. */
export function comboboxHasValue(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.value.trim()) return true;
    const control = el.closest('[class*="control" i], [class*="select" i]');
    const single = control?.querySelector('[class*="single-value" i], [class*="singleValue" i], [class*="multi-value" i]');
    return Boolean(single && text(single));
  }
  const t = text(el);
  return Boolean(t) && !/^(select|choose|please select|--)/i.test(t);
}

export function base64ToFile(b64: string, name: string, type: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}

export function isPressed(b: HTMLElement): boolean {
  return b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true' || /\b_?(active|selected)_?\b/i.test(b.className);
}

/**
 * What the field currently shows, as text: the typed value, the chosen
 * option's label, "yes"/"no" for checkboxes, the file name for uploads.
 * Empty string means nothing is set.
 */
export function readValue(
  kind: string,
  el: HTMLElement,
  choices?: HTMLElement[],
  options?: string[],
): string {
  if (kind === 'radio' && choices) {
    const i = (choices as HTMLInputElement[]).findIndex((r) => r.checked);
    return i >= 0 ? (options?.[i] ?? (choices[i] as HTMLInputElement).value) : '';
  }
  if (choices) {
    const b = choices.find(isPressed);
    return b ? text(b) : '';
  }
  if (el instanceof HTMLSelectElement) return el.selectedIndex > 0 || el.value ? (el.selectedOptions[0]?.text.trim() ?? '') : '';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked ? 'yes' : 'no';
  if (el instanceof HTMLInputElement && el.type === 'file') return el.files?.[0]?.name ?? '';
  if (kind === 'combobox') {
    if (el instanceof HTMLInputElement) {
      const control = el.closest('[class*="control" i], [class*="select" i]');
      const single = control?.querySelector('[class*="single-value" i], [class*="singleValue" i], [class*="multi-value" i]');
      return (single && text(single)) || el.value.trim();
    }
    const t = text(el);
    return /^(select|choose|please select|--)/i.test(t) ? '' : t;
  }
  return (el as HTMLInputElement).value?.trim() ?? '';
}
