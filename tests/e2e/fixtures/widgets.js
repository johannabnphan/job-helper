// Minimal stand-ins for the custom widgets ATS forms use, so the fixtures
// exercise the same code paths: react-select style comboboxes, Workday
// listbox buttons, and Ashby Yes/No button pairs.

function menuFor(owner, items, onPick) {
  document.querySelectorAll('.fake-menu').forEach((m) => m.remove());
  const r = owner.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'fake-menu';
  menu.setAttribute('role', 'listbox');
  menu.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.bottom + scrollY}px;width:${r.width}px;background:#fff;border:1px solid #999;z-index:10`;
  for (const item of items) {
    const o = document.createElement('div');
    o.setAttribute('role', 'option');
    o.textContent = item;
    o.style.padding = '4px';
    o.addEventListener('click', () => { onPick(item); menu.remove(); });
    menu.append(o);
  }
  document.body.append(menu);
}

/** react-select-ish: typing filters a portal menu; picking shows a single-value div. */
window.fakeReactSelect = (input, options) => {
  const control = input.closest('.select__control');
  const single = control.querySelector('.select__single-value');
  const open = () => {
    const q = input.value.toLowerCase();
    menuFor(input, options.filter((o) => o.toLowerCase().includes(q)), (item) => {
      single.textContent = item;
      input.value = '';
      input.dataset.value = item;
    });
  };
  input.addEventListener('input', open);
  input.addEventListener('mousedown', open);
};

/** Workday-ish: a button that opens a listbox and shows the chosen value. */
window.fakeListboxButton = (button, options) => {
  button.addEventListener('click', () =>
    menuFor(button, options, (item) => { button.textContent = item; button.dataset.value = item; }),
  );
};

/** Ashby-ish: Yes/No buttons, the chosen one gets an "_active_" class. */
window.fakeYesNo = (container) => {
  const buttons = [...container.querySelectorAll('button')];
  for (const b of buttons) b.addEventListener('click', () => {
    buttons.forEach((x) => x.classList.remove('_active_'));
    b.classList.add('_active_');
  });
};
