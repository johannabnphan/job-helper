import type { Adapter } from './types';

/** Fallback for any site: pure label matching, no site-specific knowledge. */
export const generic: Adapter = {
  name: 'Generic',
  matches: () => true,
};
