import type { Answer, Profile } from './types';

/** Sent from the side panel to the content script in each frame. */
export interface FillPayload {
  profile: Profile;
  answers: Answer[];
  resume?: { name: string; type: string; base64: string };
}

export type FieldStatus = 'filled' | 'review' | 'missing' | 'skipped';

export interface FieldReport {
  label: string;
  status: FieldStatus;
  detail: string;
  value?: string;
}

/** Returned by each frame after filling. */
export interface FillReport {
  url: string;
  adapter: string;
  fields: FieldReport[];
  error?: string;
}
