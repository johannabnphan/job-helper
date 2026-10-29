// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { couldSubmit, safeClick } from '../src/content/fill';

function el(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector('[data-t]') as HTMLElement;
}

describe('never submit', () => {
  it.each([
    ['<form><button data-t>Send</button></form>', 'button with no type inside a form'],
    ['<form><button type="submit" data-t>Go</button></form>', 'explicit submit button'],
    ['<input type="submit" data-t value="Apply">', 'submit input'],
    ['<button type="button" data-t>Submit application</button>', 'type=button labelled Submit'],
    ['<button type="button" data-t>Save and Continue</button>', 'Workday next step'],
    ['<div role="button" data-t>Next</div>', 'role=button labelled Next'],
    ['<form><button data-t><span>icon</span></button></form>', 'nested content in a default-submit button'],
  ])('refuses %s (%s)', (html) => {
    const target = el(html);
    expect(couldSubmit(target)).toBe(true);
    let clicked = false;
    target.addEventListener('click', () => (clicked = true));
    expect(safeClick(target)).toBe(false);
    expect(clicked).toBe(false);
  });

  it.each([
    ['<form><button type="button" data-t>Yes</button></form>', 'Ashby yes/no button'],
    ['<button type="button" aria-haspopup="listbox" data-t>Select One</button>', 'Workday dropdown'],
    ['<div role="option" data-t>United States</div>', 'dropdown option'],
    ['<form><label><input type="radio" data-t> No</label></form>', 'radio'],
  ])('allows %s (%s)', (html) => {
    expect(couldSubmit(el(html))).toBe(false);
  });
});

describe('never submit inside web components', () => {
  it('refuses a shadow-DOM button whose slotted text says Submit', () => {
    document.body.innerHTML = '<x-btn>Submit application</x-btn>';
    const host = document.querySelector('x-btn')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button type="button"><slot></slot></button>';
    const inner = root.querySelector('button')!;
    expect(couldSubmit(inner)).toBe(true);
    expect(safeClick(inner)).toBe(false);
  });

  it('allows a shadow-DOM "+ Add" button', () => {
    document.body.innerHTML = '<x-btn>+ Add</x-btn>';
    const host = document.querySelector('x-btn')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button type="button"><slot></slot></button>';
    expect(couldSubmit(root.querySelector('button')!)).toBe(false);
  });
});
