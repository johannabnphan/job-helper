// User preferences for the app experience and job search. Local only.
export type Personality = 'encouraging' | 'straightforward' | 'quiet' | 'playful';
export type Workplace = 'remote' | 'hybrid' | 'onsite';

export interface JobSearchPrefs {
  titles: string[];
  location: string;
  workplace: Workplace[];
  salaryMin: string;
  level: '' | 'entry' | 'mid' | 'senior' | 'lead';
  skills: string[];
  industries: string[];
  /** Company job boards to pull real openings from, e.g. "greenhouse:anthropic", "lever:netflix", "ashby:notion". */
  boards: string[];
}

export interface Prefs {
  onboarded: boolean;
  /** Applications per day; null = follow the energy suggestion. */
  dailyGoal: number | null;
  /** XP, levels, badges and celebrations. */
  gamification: boolean;
  /** Small animations (always off when the OS asks for reduced motion). */
  animations: boolean;
  companion: Personality;
  companionOpen: boolean;
  /** Follow-up reminders on the dashboard. */
  reminders: boolean;
  search: JobSearchPrefs;
  /** Job ids skipped in Find Jobs. */
  skipped: string[];
}

export function defaultPrefs(): Prefs {
  return {
    onboarded: false,
    dailyGoal: null,
    gamification: true,
    animations: true,
    companion: 'encouraging',
    companionOpen: true,
    reminders: true,
    search: { titles: [], location: '', workplace: [], salaryMin: '', level: '', skills: [], industries: [], boards: [] },
    skipped: [],
  };
}
