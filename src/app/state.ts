// Everything a screen needs, loaded once per render.
import { dayKey, levelInfo, type BuddyState, type Energy } from '../shared/buddy';
import type { Prefs } from '../shared/prefs';
import { getBuddy, getJobs, getPrefs, getProfile } from '../shared/storage';
import type { Job, Profile } from '../shared/types';

export interface AppState {
  prefs: Prefs;
  buddy: BuddyState;
  jobs: Job[];
  profile: Profile;
  /** Energy picked today, if any. */
  energy?: Energy;
  level: ReturnType<typeof levelInfo>;
  rerender(): void;
}

export async function loadState(rerender: () => void): Promise<AppState> {
  const [prefs, buddy, jobs, profile] = await Promise.all([getPrefs(), getBuddy(), getJobs(), getProfile()]);
  const energy = buddy.energy?.date === dayKey() ? buddy.energy.level : undefined;
  return { prefs, buddy, jobs, profile, energy, level: levelInfo(buddy.xp), rerender };
}

export function firstName(s: AppState): string {
  return s.profile.preferredName || s.profile.firstName || '';
}
