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
  const a = (question: string, keywords: string[]): Answer => ({ id: uid(), question, keywords, answer: '' });
  return [
    a('Visa sponsorship', ['sponsorship', 'sponsor', 'visa', 'h-1b', 'h1b', 'immigration']),
    a('Willing to relocate', ['relocate', 'relocation', 'willing to move']),
    a('Notice period', ['notice period', 'notice', 'how soon', 'available to start', 'availability']),
    a('How did you hear about us', ['how did you hear', 'hear about', 'how did you find', 'source', 'referred', 'referral']),
    a('Remote / hybrid / onsite preference', ['remote', 'hybrid', 'onsite', 'on-site', 'in office', 'in-office']),
    a('Willing to travel', ['travel']),
    a('Previously worked here', ['previously worked', 'previously been employed', 'former employee', 'worked for us before']),
  ];
}
