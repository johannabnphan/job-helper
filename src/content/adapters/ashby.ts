// Ashby: jobs.ashbyhq.com/<company>/<id>/application (also embedded on company sites).
import type { ProfileKey } from '../../shared/matcher';
import { text, visibleAncestor, type FieldHandle } from '../fields';
import type { Adapter } from './types';

const SYSTEM: Record<string, ProfileKey> = {
  _systemfield_name: 'fullName',
  _systemfield_email: 'email',
  _systemfield_phone: 'phone',
  _systemfield_resume: 'resume',
  _systemfield_location: 'location',
  _systemfield_linkedin: 'linkedin',
  _systemfield_eeoc_gender: 'gender',
  _systemfield_eeoc_race: 'race',
  _systemfield_eeoc_veteran_status: 'veteran',
  _systemfield_eeoc_disability_status: 'disability',
};

const ENTRY = '.ashby-application-form-field-entry, [class*="fieldEntry" i]';

function entryLabel(el: Element): string | undefined {
  const entry = el.closest(ENTRY);
  const label = entry?.querySelector('.ashby-application-form-question-title, label, [class*="questionTitle" i]');
  return label ? text(label) : undefined;
}

export const ashby: Adapter = {
  name: 'Ashby',
  matches: (loc, doc) => /(^|\.)ashbyhq\.com$/.test(loc.hostname) || Boolean(doc.querySelector('.ashby-application-form-field-entry')),
  root: (doc) => doc.querySelector('.ashby-application-form-container, [class*="ashby-application-form"]')?.closest('form') ?? doc.querySelector('form'),
  label: (el) => (el.closest(ENTRY) ? entryLabel(el) : undefined),
  describe(f) {
    const id = f.el.id || f.el.getAttribute('name') || '';
    const hint = SYSTEM[id];
    if (hint === 'location') return { hint, review: 'Pick the matching city from the list' };
    return hint ? { hint } : undefined;
  },
  // Yes/No questions are a pair of plain buttons, not radios.
  extraFields(root) {
    const out: FieldHandle[] = [];
    for (const entry of root.querySelectorAll<HTMLElement>(ENTRY)) {
      if (entry.querySelector('input:not([type=hidden]), select, textarea')) continue;
      const buttons = [...entry.querySelectorAll<HTMLButtonElement>('button')].filter((b) => /^(yes|no)$/i.test(text(b)));
      if (buttons.length < 2) continue;
      const container = (buttons[0].parentElement ?? entry) as HTMLElement;
      out.push({
        kind: 'combobox',
        el: container,
        choices: buttons,
        anchor: visibleAncestor(container) ?? entry,
        label: entryLabel(container) ?? '',
        attrs: '',
        options: buttons.map((b) => text(b)),
        required: Boolean(entry.querySelector('[class*="required" i]')),
      });
    }
    return out;
  },
};
