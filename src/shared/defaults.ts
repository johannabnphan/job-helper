import type { Answer, Profile } from './types';

export function uid(): string {
  return crypto.randomUUID();
}

export function emptyProfile(): Profile {
  return {
    firstName: '',
    lastName: '',
    preferredName: '',
    pronouns: '',
    email: '',
    phone: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    links: { linkedin: '', portfolio: '', github: '', other: '' },
    work: [],
    education: [],
    skills: [],
    workAuth: { authorizedToWork: '', requiresSponsorship: '', status: '', countries: '' },
    salary: { min: '', max: '', currency: 'USD', period: 'year' },
    startDate: '',
    eeo: { gender: '', race: '', hispanicLatino: '', veteran: '', disability: '' },
    updatedAt: 0,
  };
}

/** Starter answer bank. Answers are blank until the user writes them. */
export function defaultAnswers(): Answer[] {
  const a = (question: string, keywords: string[], phrasings: string[] = []): Answer => ({
    id: uid(),
    question,
    keywords,
    phrasings,
    answer: '',
    variants: [],
  });
  return [
    a('Visa sponsorship', ['sponsorship', 'sponsor', 'visa', 'h-1b', 'h1b', 'immigration'], [
      'Will you now or in the future require sponsorship for employment visa status?',
      'Do you require visa sponsorship to work in this country?',
    ]),
    a('Willing to relocate', ['relocate', 'relocation', 'willing to move'], ['Are you open to moving for this role?']),
    a('Notice period', ['notice period', 'notice', 'how soon', 'available to start', 'availability'], [
      'How much notice do you need to give your current employer?',
    ]),
    a('How did you hear about us', ['how did you hear', 'hear about', 'how did you find', 'source', 'referred', 'referral'], [
      'Where did you find this job posting?',
    ]),
    a('Remote / hybrid / onsite preference', ['remote', 'hybrid', 'onsite', 'on-site', 'in office', 'in-office'], [
      'Are you able to work from our office several days a week?',
    ]),
    a('Willing to travel', ['travel'], ['What percentage of time are you able to be on the road?']),
    a('Previously worked here', ['previously worked', 'previously been employed', 'former employee', 'worked for us before'], [
      'Have you ever been employed by this company?',
    ]),
  ];
}
