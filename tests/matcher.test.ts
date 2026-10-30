import { describe, expect, it } from 'vitest';
import { defaultAnswers, emptyProfile } from '../src/shared/defaults';
import {
  isResolved,
  matchAnswer,
  matchProfileKey,
  parseMonthYear,
  pickBestOption,
  pickOption,
  findAnswer,
  questionSimilarity,
  WEAK_OPTION,
  profileValue,
  resolveField,
  type FieldDescriptor,
} from '../src/shared/matcher';
import type { Profile } from '../src/shared/types';

const f = (label: string, kind: FieldDescriptor['kind'] = 'text', extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({ label, kind, ...extra });

function profile(): Profile {
  const p = emptyProfile();
  Object.assign(p, { firstName: 'Alex', lastName: 'Rivera', email: 'alex@example.com', phone: '555-123-4567', startDate: 'Two weeks after offer' });
  p.address = { line1: '1 Main St', line2: '', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'United States' };
  p.links.linkedin = 'https://linkedin.com/in/alex';
  p.links.portfolio = 'https://alex.dev';
  p.work = [
    { id: '1', company: 'Northwind', title: 'Senior Designer', location: 'Remote', startDate: 'Jan 2021', endDate: '', current: true, description: '' },
    { id: '2', company: 'Contoso', title: 'Designer', location: '', startDate: '06/2018', endDate: '12/2020', current: false, description: '' },
  ];
  p.education = [{ id: '3', school: 'RISD', degree: 'BFA', field: 'Graphic Design', startDate: '2014', endDate: '2018', gpa: '' }];
  p.workAuth = { authorizedToWork: 'yes', requiresSponsorship: 'no', status: 'US citizen', countries: 'United States' };
  p.salary = { min: '140000', max: '170000', currency: 'USD', period: 'year' };
  p.eeo.gender = 'Decline to self-identify';
  return p;
}

describe('matchProfileKey', () => {
  it.each([
    ['First Name *', 'firstName'],
    ['Legal last name', 'lastName'],
    ['Full name', 'fullName'],
    ['Name', 'fullName'],
    ['Email address', 'email'],
    ['Phone', 'phone'],
    ['LinkedIn Profile', 'linkedin'],
    ['Website', 'portfolio'],
    ['Portfolio URL', 'portfolio'],
    ['Current location', 'location'],
    ['Zip code', 'postalCode'],
    ['Current company', 'currentCompany'],
    ['Desired salary', 'salary'],
    ['When can you start?', 'startDate'],
    ['Gender', 'gender'],
    ['Are you a protected veteran?', 'veteran'],
  ])('%s -> %s', (label, key) => {
    expect(matchProfileKey(f(label))).toBe(key);
  });

  it('uses kind-restricted rules', () => {
    expect(matchProfileKey(f('Resume/CV', 'file'))).toBe('resume');
    expect(matchProfileKey(f('Will you now or in the future require visa sponsorship?', 'radio'))).toBe('requiresSponsorship');
    expect(matchProfileKey(f('Are you legally authorized to work in the United States?', 'select'))).toBe('authorizedToWork');
  });

  it('does not confuse other people\'s names', () => {
    expect(matchProfileKey(f("Referrer's first name"))).toBeUndefined();
    expect(matchProfileKey(f('Company name'))).not.toBe('fullName');
  });

  it('falls back to name/id attributes and autocomplete', () => {
    expect(matchProfileKey(f('', 'text', { attrs: 'legalName--firstName' }))).toBe('firstName');
    expect(matchProfileKey(f('Your info', 'text', { autocomplete: 'family-name' }))).toBe('lastName');
  });

  it('resolves dates inside work and education sections', () => {
    expect(matchProfileKey(f('Start date month', 'select'), 'work')).toBe('workStartMonth');
    expect(matchProfileKey(f('End year', 'select'), 'education')).toBe('eduEndYear');
    expect(matchProfileKey(f('Title'), 'work')).toBe('workTitle');
  });
});

describe('profileValue', () => {
  const p = profile();
  it('formats derived values', () => {
    expect(profileValue('fullName', p)).toBe('Alex Rivera');
    expect(profileValue('location', p)).toBe('Brooklyn, NY, United States');
    expect(profileValue('salary', p)).toBe('$140,000 – $170,000 per year');
    expect(profileValue('salary', p, 0, 'number')).toBe('140000');
    expect(profileValue('currentTitle', p)).toBe('Senior Designer');
  });
  it('indexes work entries and splits dates', () => {
    expect(profileValue('workCompany', p, 1)).toBe('Contoso');
    expect(profileValue('workStartMonth', p, 1, 'select')).toBe('June');
    expect(profileValue('workStartMonth', p, 1, 'text')).toBe('06');
    expect(profileValue('workEndYear', p, 1)).toBe('2020');
    expect(profileValue('workEndYear', p, 0)).toBeUndefined(); // current job
    expect(profileValue('workStart', p, 0, 'month')).toBe('2021-01');
  });
  it('parses month/year strings', () => {
    expect(parseMonthYear('Sept 2019')).toEqual({ month: 9, year: '2019' });
    expect(parseMonthYear('2020-07')).toEqual({ month: 7, year: '2020' });
  });
});

describe('pickOption', () => {
  it('handles yes/no', () => {
    expect(pickOption(['Select...', 'Yes', 'No'], 'no')).toMatchObject({ index: 2, exact: true, score: 1 });
    expect(pickOption(['Yes, I am authorized', 'No, I am not'], 'yes')?.index).toBe(0);
    expect(pickOption(['Yes', 'No'], 'No, I will not need sponsorship.')?.index).toBe(1);
  });
  it('handles aliases and states', () => {
    expect(pickOption(['Canada', 'United States of America'], 'United States')?.index).toBe(1);
    expect(pickOption(['New Jersey', 'New York'], 'NY')?.index).toBe(1);
    expect(pickOption(['Male', 'Female', 'I don\'t wish to answer'], 'Decline to self-identify')?.index).toBe(2);
  });
  it('handles degrees and months', () => {
    expect(pickOption(["High School", "Bachelor's Degree", "Master's Degree"], 'BFA')?.index).toBe(1);
    expect(pickOption(['01', '02', '03'], 'March')?.index).toBe(2);
  });
  it('returns undefined when nothing fits', () => {
    expect(pickOption(['Red', 'Blue'], 'Green')).toBeUndefined();
  });
});

describe('answer bank', () => {
  const answers = defaultAnswers();
  answers.find((a) => a.question === 'Visa sponsorship')!.answer = 'No';
  answers.find((a) => a.question === 'How did you hear about us')!.answer = 'LinkedIn';

  it('matches by keyword', () => {
    expect(matchAnswer('How did you hear about this job?', answers)?.answer).toBe('LinkedIn');
    expect(matchAnswer('Are you willing to relocate?', answers)).toBeUndefined(); // blank answer
  });

  it('resolves fields end to end', () => {
    const ctx = { profile: profile(), answers };
    const r1 = resolveField(f('Email', 'email'), ctx);
    expect(isResolved(r1) && r1.value).toBe('alex@example.com');

    const r2 = resolveField(f('How did you hear about us?', 'select', { options: ['LinkedIn', 'Indeed'] }), ctx);
    expect(isResolved(r2) && r2.confidence).toBe('high');

    const r3 = resolveField(f('Why do you want to work here?', 'textarea'), ctx);
    expect(isResolved(r3)).toBe(false);
    expect(!isResolved(r3) && r3.openEnded).toBe(true);

    const r4 = resolveField(f('Are you willing to relocate?', 'radio'), ctx);
    expect(!isResolved(r4) && r4.reason).toMatch(/empty/);
  });
});

describe('pickOption word overlap', () => {
  it('matches city + state abbreviation to a long location option', () => {
    expect(pickOption(['Brookline, Massachusetts, United States', 'Brooklyn, New York, United States'], 'Brooklyn, NY')?.index).toBe(1);
  });
});

describe('keyword stemming', () => {
  it('matches word forms of a keyword', () => {
    const answers = [{ id: '1', question: 'Relocation', keywords: ['relocate'], answer: 'Yes' }];
    expect(matchAnswer('Are you open to relocating to New York?', answers)?.answer).toBe('Yes');
    expect(matchAnswer('Relocation assistance needed?', answers)?.answer).toBe('Yes');
    expect(matchAnswer('Are you local?', answers)).toBeUndefined();
  });
});

describe('answer variants and phrasings', () => {
  const answers = [
    {
      id: 's',
      question: 'Visa sponsorship',
      keywords: [],
      phrasings: ['Will you now or in the future require sponsorship for employment visa status?'],
      answer: 'No',
      variants: ['I do not require sponsorship', 'Not required'],
    },
  ];

  it('matches a differently worded question by phrasing', () => {
    const m = findAnswer('Do you require visa sponsorship now or in the future?', answers);
    expect(m?.answer.id).toBe('s');
    expect(m?.weak).toBe(false);
  });

  it('flags a loose phrasing match as weak', () => {
    const m = findAnswer('Will you require employment sponsorship?', answers);
    expect(m?.weak).toBe(true);
  });

  it('ignores unrelated questions', () => {
    expect(findAnswer('What is your favorite color?', answers)).toBeUndefined();
    expect(questionSimilarity('a b', '')).toBe(0);
  });

  it('uses answer variants to pick dropdown options', () => {
    const opts = ['Sponsorship required', 'Sponsorship not required'];
    const p = pickBestOption(opts, ['No', 'I do not require sponsorship', 'Not required']);
    expect(p?.index).toBe(1);
  });

  it('scores weak option picks below the threshold', () => {
    const p = pickOption(["High School", "Bachelor's Degree"], 'BFA');
    expect(p!.score).toBeLessThan(WEAK_OPTION);
    expect(pickOption(['Yes', 'No'], 'Yes')!.score).toBeGreaterThanOrEqual(WEAK_OPTION);
  });
});

describe('profile value that fits no option', () => {
  it('falls back to the answer bank', () => {
    const p = profile();
    const answers = [{ id: 'v', question: 'Visa', keywords: ['visa'], answer: 'No', variants: ['Sponsorship not required'] }];
    const r = resolveField(f('Visa status', 'select', { options: ['Sponsorship required', 'Sponsorship not required'] }), { profile: p, answers });
    expect(isResolved(r) && r.variants).toContain('Sponsorship not required');
  });
});

describe('split name boxes under one "Name" label', () => {
  it('uses the placeholder or name attribute', () => {
    expect(matchProfileKey(f('Name', 'text', { placeholder: 'First' }))).toBe('firstName');
    expect(matchProfileKey(f('Name *', 'text', { placeholder: 'Last name' }))).toBe('lastName');
    expect(matchProfileKey(f('Full name', 'text', { attrs: 'applicant_last_name' }))).toBe('lastName');
    expect(matchProfileKey(f('Name', 'text'))).toBe('fullName');
  });
});
