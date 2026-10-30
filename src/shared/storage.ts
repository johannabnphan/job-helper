// Thin typed wrapper over chrome.storage.local. Nothing here leaves the browser.
import { defaultAnswers, emptyProfile } from './defaults';
import { emptyAi, type AiSettings } from './ai';
import { applyActivity, emptyBuddy, type ActivityType, type BuddyState, type RecordResult } from './buddy';
import { migrateJob } from './jobs';
import { defaultPrefs, type Prefs } from './prefs';
import type { Answer, Job, Profile } from './types';

const KEYS = { profile: 'profile', answers: 'answers', jobs: 'jobs', buddy: 'buddy', ai: 'ai', resumeText: 'resumeText', prefs: 'prefs' } as const;

async function get<T>(key: string): Promise<T | undefined> {
  const res = await chrome.storage.local.get(key);
  return res[key] as T | undefined;
}

function set(key: string, value: unknown): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

/** Deep-merge stored data over defaults so new fields added later get sane values. */
function mergeDefaults<T extends object>(defaults: T, stored: Partial<T> | undefined): T {
  if (!stored) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(stored)) {
    const d = (defaults as Record<string, unknown>)[k];
    out[k] =
      d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)
        ? mergeDefaults(d as object, v as object)
        : v;
  }
  return out as T;
}

export async function getProfile(): Promise<Profile> {
  return mergeDefaults(emptyProfile(), await get<Partial<Profile>>(KEYS.profile));
}

export function saveProfile(profile: Profile): Promise<void> {
  return set(KEYS.profile, { ...profile, updatedAt: Date.now() });
}

export async function getAnswers(): Promise<Answer[]> {
  const stored = await get<Answer[]>(KEYS.answers);
  if (stored) return stored;
  const seeded = defaultAnswers();
  await set(KEYS.answers, seeded);
  return seeded;
}

export function saveAnswers(answers: Answer[]): Promise<void> {
  return set(KEYS.answers, answers);
}

export async function getJobs(): Promise<Job[]> {
  return ((await get<Job[]>(KEYS.jobs)) ?? []).map(migrateJob);
}

export function saveJobs(jobs: Job[]): Promise<void> {
  return set(KEYS.jobs, jobs);
}

export async function getBuddy(): Promise<BuddyState> {
  return { ...emptyBuddy(), ...((await get<BuddyState>(KEYS.buddy)) ?? {}) };
}

export function saveBuddy(state: BuddyState): Promise<void> {
  return set(KEYS.buddy, state);
}

export async function getPrefs(): Promise<Prefs> {
  const stored = (await get<Partial<Prefs>>(KEYS.prefs)) ?? {};
  const d = defaultPrefs();
  return { ...d, ...stored, search: { ...d.search, ...(stored.search ?? {}) } };
}

export async function savePrefs(update: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...update };
  await set(KEYS.prefs, next);
  return next;
}

/** Logs real progress for Buddy (XP, missions). Safe to call twice for the same job. */
export async function recordActivity(type: Exclude<ActivityType, 'mission_done'>, ref?: string): Promise<RecordResult> {
  const result = applyActivity(await getBuddy(), type, ref, Date.now(), (await getPrefs()).dailyGoal);
  if (result.gained) await saveBuddy(result.state);
  return result;
}

export async function getAi(): Promise<AiSettings> {
  return { ...emptyAi(), ...((await get<AiSettings>(KEYS.ai)) ?? {}) };
}

export function saveAi(ai: AiSettings): Promise<void> {
  return set(KEYS.ai, ai);
}

/** Plain text of the resume, saved when it's uploaded or imported. Used for AI drafts. */
export async function getResumeText(): Promise<string> {
  return (await get<string>(KEYS.resumeText)) ?? '';
}

export function saveResumeText(text: string): Promise<void> {
  return set(KEYS.resumeText, text);
}

/** Calls `cb` whenever one of the given keys changes (from any extension page). */
export function onStorageChange(keys: Array<keyof typeof KEYS>, cb: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && keys.some((k) => KEYS[k] in changes)) cb();
  });
}

/** Everything except the resume file, for backup/export. */
export async function exportAll(): Promise<{ profile: Profile; answers: Answer[]; jobs: Job[] }> {
  return { profile: await getProfile(), answers: await getAnswers(), jobs: await getJobs() };
}

export async function importAll(data: { profile?: Profile; answers?: Answer[]; jobs?: Job[] }): Promise<void> {
  if (data.profile) await saveProfile(mergeDefaults(emptyProfile(), data.profile));
  if (data.answers) await saveAnswers(data.answers);
  if (data.jobs) await saveJobs(data.jobs);
}
