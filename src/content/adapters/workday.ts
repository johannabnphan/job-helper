// Workday: <tenant>.wdN.myworkdayjobs.com and myworkdaysite.com. Multi-step
// wizard: run Fill on each step, then click "Save and Continue" yourself.
import type { ProfileKey } from '../../shared/matcher';
import { text } from '../fields';
import type { Adapter } from './types';

/** Workday ids and data-automation-ids, old ("legalNameSection_firstName") and new ("legalName--firstName"). */
const RULES: Array<[RegExp, ProfileKey]> = [
  [/legalname.*firstname|(^|[-_])firstname/i, 'firstName'],
  [/legalname.*lastname|(^|[-_])lastname/i, 'lastName'],
  [/addressline1/i, 'addressLine1'],
  [/addressline2/i, 'addressLine2'],
  [/(address.*city|(^|[-_])city$)/i, 'city'],
  [/postalcode/i, 'postalCode'],
  [/countryregion/i, 'state'],
  [/(^|[-_])country([-_]|$)|countrydropdown/i, 'country'],
  [/phonenumber|phone-number/i, 'phone'],
  [/(^|[-_])email/i, 'email'],
  [/linkedin/i, 'linkedin'],
  [/jobtitle/i, 'workTitle'],
  [/companyname|(^|[-_])company$/i, 'workCompany'],
  [/roledescription/i, 'workDescription'],
  [/currentlyworkhere/i, 'workCurrent'],
  [/schoolname|(^|[-_])school$/i, 'school'],
  [/(^|[-_])degree/i, 'degree'],
  [/fieldofstudy/i, 'fieldOfStudy'],
  [/gradeaverage/i, 'gpa'],
  [/firstyearattended/i, 'eduStartYear'],
  [/lastyearattended/i, 'eduEndYear'],
  [/file-upload-input-ref/i, 'resume'],
];

const IGNORE = /countryphonecode|phone-?device-?type|devicetype|phoneextension|middlename|legalname.*suffix|prefix/i;

/** id / name / data-automation-id of the element and its form-field ancestors. */
function ids(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
    parts.push(node.id, node.getAttribute('name') ?? '', node.getAttribute('data-automation-id') ?? '');
    if (node.getAttribute('data-automation-id')?.startsWith('formField-')) break;
  }
  return parts.filter(Boolean).join(' ');
}

function panelOf(el: HTMLElement, kind: 'workExperience' | 'education'): string | undefined {
  const re = new RegExp(`\\b${kind}-(\\d+)`);
  let node: HTMLElement | null = el;
  for (let i = 0; i < 15 && node; i++, node = node.parentElement) {
    const m = `${node.id} ${node.getAttribute('data-automation-id') ?? ''}`.match(re);
    if (m) return m[0];
  }
  return undefined;
}

function panelIndex(doc: Document, el: HTMLElement, kind: 'workExperience' | 'education'): number | undefined {
  const panel = panelOf(el, kind);
  if (!panel) return undefined;
  // Workday numbers panels arbitrarily; the order on the page is what counts.
  const seen: string[] = [];
  for (const node of doc.querySelectorAll<HTMLElement>(`[data-automation-id^="${kind}-"], [id^="${kind}-"]`)) {
    const m = `${node.id} ${node.getAttribute('data-automation-id') ?? ''}`.match(new RegExp(`\\b${kind}-(\\d+)`));
    if (m && !seen.includes(m[0])) seen.push(m[0]);
  }
  return seen.indexOf(panel);
}

export const workday: Adapter = {
  name: 'Workday',
  matches: (loc, doc) =>
    /myworkdayjobs\.com$|myworkdaysite\.com$|myworkday\.com$/.test(loc.hostname) || Boolean(doc.querySelector('[data-automation-id="applyFlowPage"], [data-automation-id^="formField-"]')),
  root: (doc) => doc.querySelector('[data-automation-id="applyFlowPage"], main') ?? doc.body,
  label(el) {
    const field = el.closest('[data-automation-id^="formField-"]');
    const label = field?.querySelector('label, legend, [data-automation-id="richText"]');
    return label ? text(label).replace(/\*$/, '').trim() : undefined;
  },
  skip: (el) => IGNORE.test(ids(el)),
  describe(f) {
    const all = ids(f.el);
    const doc = f.el.ownerDocument;
    const workIdx = panelIndex(doc, f.el, 'workExperience');
    const eduIdx = panelIndex(doc, f.el, 'education');
    const where = workIdx !== undefined ? { section: 'work' as const, index: workIdx } : eduIdx !== undefined ? { section: 'education' as const, index: eduIdx } : {};

    // Month/year boxes inside "From"/"To" date widgets.
    if (/datesectionmonth|datesectionyear/i.test(all) && workIdx !== undefined) {
      const part = /datesectionmonth/i.test(all) ? 'Month' : 'Year';
      const which = /enddate|todate/i.test(all) ? 'End' : 'Start';
      return { ...where, hint: `work${which}${part}` as ProfileKey, review: 'Check the date' };
    }
    for (const [re, key] of RULES) if (re.test(all)) return { ...where, hint: key };
    return Object.keys(where).length ? where : undefined;
  },
  notes(doc, payload) {
    const out: Array<{ anchor: HTMLElement; message: string }> = [];
    const sections: Array<['workExperience' | 'education', number, string]> = [
      ['workExperience', payload.profile.work.length, 'Work Experience'],
      ['education', payload.profile.education.length, 'Education'],
    ];
    for (const [kind, want, title] of sections) {
      const panels = new Set<string>();
      doc.querySelectorAll<HTMLElement>(`[data-automation-id^="${kind}-"], [id^="${kind}-"]`).forEach((n) => {
        const m = `${n.id} ${n.getAttribute('data-automation-id') ?? ''}`.match(new RegExp(`\\b${kind}-(\\d+)`));
        if (m) panels.add(m[0]);
      });
      const add = [...doc.querySelectorAll<HTMLElement>('button[data-automation-id="add-button"], button')].find((b) =>
        new RegExp(`add.*${title}|${title}.*add`, 'i').test(`${b.getAttribute('aria-label') ?? ''} ${text(b.closest('[role="group"], section, fieldset') ?? b)}`),
      );
      if (add && want > panels.size) {
        out.push({ anchor: add, message: `Click Add for ${want - panels.size} more ${title} entr${want - panels.size > 1 ? 'ies' : 'y'}, then Fill again` });
      }
    }
    return out;
  },
};
