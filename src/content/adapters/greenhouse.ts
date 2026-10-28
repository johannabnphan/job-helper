// Greenhouse: job-boards.greenhouse.io (React app) and the classic
// boards.greenhouse.io form, including the embed iframe on company sites.
import type { ProfileKey } from '../../shared/matcher';
import { text } from '../fields';
import type { Adapter } from './types';

const IDS: Record<string, ProfileKey> = {
  first_name: 'firstName',
  last_name: 'lastName',
  preferred_name: 'preferredName',
  email: 'email',
  phone: 'phone',
  resume: 'resume',
  resume_text: 'resume',
  cover_letter: 'coverLetter',
  'candidate-location': 'location',
  job_application_location: 'location',
  auto_complete_input: 'location',
  gender: 'gender',
  race: 'race',
  hispanic_ethnicity: 'hispanicLatino',
  veteran_status: 'veteran',
  disability_status: 'disability',
};

// Repeating education/employment rows: "school--0", "start-year--1", "company-name-0"...
const INDEXED: Array<[RegExp, ProfileKey, 'work' | 'education']> = [
  [/^school(?:[-_]name)?--?(\d+)$/, 'school', 'education'],
  [/^degree--?(\d+)$/, 'degree', 'education'],
  [/^discipline--?(\d+)$/, 'fieldOfStudy', 'education'],
  [/^start-month--?(\d+)$/, 'eduStartMonth', 'education'],
  [/^start-year--?(\d+)$/, 'eduStartYear', 'education'],
  [/^end-month--?(\d+)$/, 'eduEndMonth', 'education'],
  [/^end-year--?(\d+)$/, 'eduEndYear', 'education'],
  [/^company-name--?(\d+)$/, 'workCompany', 'work'],
  [/^title--?(\d+)$/, 'workTitle', 'work'],
  [/^employment-start-month--?(\d+)$/, 'workStartMonth', 'work'],
  [/^employment-start-year--?(\d+)$/, 'workStartYear', 'work'],
  [/^employment-end-month--?(\d+)$/, 'workEndMonth', 'work'],
  [/^employment-end-year--?(\d+)$/, 'workEndYear', 'work'],
  [/^current-role--?(\d+)$/, 'workCurrent', 'work'],
];

// Classic form names, e.g. job_application[gender], education_degree_id.
const NAMES: Array<[RegExp, ProfileKey]> = [
  [/\[gender\]$/, 'gender'],
  [/\[race\]$/, 'race'],
  [/\[hispanic_ethnicity\]$/, 'hispanicLatino'],
  [/\[veteran_status\]$/, 'veteran'],
  [/\[disability_status\]$/, 'disability'],
  [/education_school_name/, 'school'],
  [/education_degree/, 'degree'],
  [/education_discipline/, 'fieldOfStudy'],
];

export const greenhouse: Adapter = {
  name: 'Greenhouse',
  matches: (loc, doc) =>
    /(^|\.)greenhouse\.io$/.test(loc.hostname) || Boolean(doc.querySelector('#application-form #first_name, #application_form #first_name')),
  root: (doc) => doc.querySelector('#application-form, #application_form, form#application'),
  label(el) {
    // File inputs sit next to "Attach" buttons; the question is the group label.
    if (el instanceof HTMLInputElement && el.type === 'file') {
      const group = el.closest('.file-upload, [class*="upload" i], fieldset, .field');
      const label = group?.querySelector('[id^="upload-label"], .label, legend, label');
      if (label) return text(label);
    }
    return undefined;
  },
  describe(f) {
    const id = f.el.id;
    const name = f.el.getAttribute('name') ?? '';
    if (IDS[id] === 'location') return { hint: 'location', review: 'Pick the matching city from the list' };
    if (IDS[id]) return { hint: IDS[id] };
    for (const [re, key, section] of INDEXED) {
      const m = id.match(re);
      if (m) return { hint: key, section, index: Number(m[1]) };
    }
    for (const [re, key] of NAMES) if (re.test(name)) return { hint: key };
    return undefined;
  },
};
