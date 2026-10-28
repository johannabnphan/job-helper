// Lever: jobs.lever.co/<company>/<id>/apply
import type { ProfileKey } from '../../shared/matcher';
import { text } from '../fields';
import type { Adapter } from './types';

const NAMES: Record<string, ProfileKey> = {
  name: 'fullName',
  email: 'email',
  phone: 'phone',
  org: 'currentCompany',
  location: 'location',
  resume: 'resume',
  'urls[LinkedIn]': 'linkedin',
  'urls[GitHub]': 'github',
  'urls[Portfolio]': 'portfolio',
  'urls[Other]': 'otherUrl',
  'eeo[gender]': 'gender',
  'eeo[race]': 'race',
  'eeo[veteran]': 'veteran',
  'eeo[disability]': 'disability',
};

export const lever: Adapter = {
  name: 'Lever',
  matches: (loc, doc) => /(^|\.)lever\.co$/.test(loc.hostname) || Boolean(doc.querySelector('form#application-form .application-question')),
  root: (doc) => doc.querySelector('#application-form, form[action*="lever"]'),
  label(el) {
    const q = el.closest('.application-question, .custom-question');
    const label = q?.querySelector('.application-label .text, .application-label');
    return label ? text(label) : undefined;
  },
  describe(f) {
    const name = f.el.getAttribute('name') ?? '';
    const hint = NAMES[name];
    if (name === 'location') return { hint, review: 'Pick your city from the suggestions so Lever saves it' };
    if (hint) return { hint };
    return undefined;
  },
  // Lever's hidden "selectedLocation" is set by its own location picker.
  skip: (el) => el.getAttribute('name') === 'selectedLocation',
};
