export type YesNo = 'yes' | 'no' | '';

export interface WorkEntry {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string; // free text, e.g. "2021-03" or "Mar 2021"
  endDate: string;
  current: boolean;
  description: string;
}

export interface EducationEntry {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface Profile {
  firstName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  links: {
    linkedin: string;
    portfolio: string;
    github: string;
    other: string;
  };
  work: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
  workAuth: {
    authorizedToWork: YesNo;
    requiresSponsorship: YesNo;
    status: string; // e.g. "US citizen", "Green card", "H-1B"
    countries: string; // where you're authorized to work
  };
  salary: {
    min: string;
    max: string;
    currency: string;
    period: 'year' | 'hour';
  };
  startDate: string; // earliest start date, free text
  /** Voluntary self-identification answers. Empty means "ask me" (field is flagged). */
  eeo: {
    gender: string;
    race: string;
    hispanicLatino: string;
    veteran: string;
    disability: string;
  };
  updatedAt: number;
}

export interface Answer {
  id: string;
  /** Short label shown in the answer bank, e.g. "Visa sponsorship". */
  question: string;
  /** Words or phrases that identify the question on a form. */
  keywords: string[];
  /** Other full wordings of the question, matched by word overlap. */
  phrasings?: string[];
  answer: string;
  /** Other ways to say the answer, used to pick dropdown/radio options. */
  variants?: string[];
}

export type JobStatus = 'saved' | 'in_progress' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected';

export interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  status: JobStatus;
  notes: string;
  addedAt: number;
  updatedAt: number;
  location?: string;
  /** Only when the posting states it. Never estimated. */
  salary?: string;
  employmentType?: string;
  /** Where it came from: 'link' (pasted) or a job board, e.g. 'greenhouse:acme'. */
  source?: string;
  appliedAt?: number;
  /** Free-text next step, e.g. "Prep for recruiter call". */
  nextAction?: string;
  /** ISO date (YYYY-MM-DD) for an application/assessment deadline. */
  deadline?: string;
  /** ISO date for an optional follow-up reminder. */
  followUp?: string;
  /** Save and resume: fields still flagged after the last fill, and when. */
  remaining?: number;
  lastFilledAt?: number;
  /** Why it was recommended (from Find Jobs), in plain words. */
  why?: string;
}

export interface StoredResume {
  name: string;
  type: string;
  size: number;
  savedAt: number;
  data: Blob;
}
