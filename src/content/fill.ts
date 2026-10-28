// Low-level value setters that work with React/Angular/Vue-controlled inputs.
// Job Helper never submits: every click goes through safeClick, which refuses
// anything that could submit or advance the form.
import { pickOption, type OptionPick } from '../shared/matcher';
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
  return SUBMIT_TEXT.test(text(btn) || btn.getAttribute('aria-label') || '');
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
  for (const t of types) el.dispatchEvent(new Event(t, { bubbles: true }));
}

/** Sets a value the way a framework expects to see a user type it. */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  el.focus({ preventScroll: true });
  const set = nativeSetter(el);
  if (set) set(value);
  else el.value = value;
  fire(el, 'input', 'change');
  el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
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

export function setSelect(el: HTMLSelectElement, value: string): OptionPick | undefined {
  const options = [...el.options];
  const pick = pickOption(options.map((o) => o.text), value) ?? pickOption(options.map((o) => o.value), value);
  if (!pick) return undefined;
  setValue(el, options[pick.index].value);
  return pick;
}

export function setRadio(radios: HTMLInputElement[], labels: string[], value: string): OptionPick | undefined {
  const pick = pickOption(labels, value);
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

export function setButtonChoice(buttons: HTMLElement[], value: string): OptionPick | undefined {
  const pick = pickOption(buttons.map((b) => text(b)), value);
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
  const scope = (listId && doc.getElementById(listId)) || doc;
  return [...scope.querySelectorAll<HTMLElement>('[role="option"], [id*="-option-"], .select__option')].filter(
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
 * Returns undefined when no suitable option appears.
 */
export async function setCombobox(el: HTMLElement, value: string): Promise<OptionPick | undefined> {
  const doc = el.ownerDocument;
  const isInput = el instanceof HTMLInputElement;

  if (isInput) {
    el.focus();
    safeClick(el);
    // Type a short query so long lists (schools, cities) get filtered.
    const query = value.split(',')[0].slice(0, 40);
    setValueKeepFocus(el, query);
  } else if (!safeClick(el)) {
    return undefined;
  }

  let options = await waitForOptions(doc, el);
  if (!options.length && isInput) {
    // Some menus only open on ArrowDown.
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
    options = await waitForOptions(doc, el, 1000);
  }
  const pick = options.length ? pickOption(options.map((o) => text(o) || o.getAttribute('aria-label') || ''), value) : undefined;
  if (!pick) {
    if (isInput) setValueKeepFocus(el, '');
    closeMenu(el);
    return undefined;
  }
  safeClick(options[pick.index]);
  await sleep(150);
  if (visibleOptions(doc, el).length) closeMenu(el);
  return pick;
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
    return Boolean(control?.querySelector('[class*="single-value" i], [class*="singleValue" i]'));
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
