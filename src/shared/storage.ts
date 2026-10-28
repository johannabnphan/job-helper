// Thin typed wrapper over chrome.storage.local. Nothing here leaves the browser.
import { defaultAnswers, emptyProfile } from './defaults';
import type { Answer, Job, Profile } from './types';

const KEYS = { profile: 'profile', answers: 'answers', jobs: 'jobs' } as const;

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
  return (await get<Job[]>(KEYS.jobs)) ?? [];
}

export function saveJobs(jobs: Job[]): Promise<void> {
  return set(KEYS.jobs, jobs);
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
