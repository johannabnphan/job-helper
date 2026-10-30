// Actions on tracked applications, shared by the side panel and the app.
import { isSubmitted, migrateJob } from './jobs';
import { getJobs, recordActivity, saveJobs } from './storage';
import type { Job, JobStatus } from './types';

/** Left part-way for at least this long counts as "resumed" when finished. */
const RESUME_GAP_MS = 30 * 60 * 1000;

export async function updateJob(id: string, fn: (j: Job) => void): Promise<Job | undefined> {
  const jobs = await getJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return undefined;
  fn(job);
  job.updatedAt = Date.now();
  await saveJobs(jobs);
  return migrateJob(job);
}

/**
 * Sets a status and logs progress. Marking something Applied twice is a
 * no-op, so the same application can't be counted (or submitted) twice.
 */
export async function setStatus(id: string, status: JobStatus): Promise<void> {
  let wasResumed = false;
  let firstSubmit = false;
  await updateJob(id, (j) => {
    if (isSubmitted(status) && !isSubmitted(j.status)) {
      firstSubmit = true;
      j.appliedAt ??= Date.now();
      j.remaining = 0;
      wasResumed = Boolean(j.lastFilledAt && Date.now() - j.lastFilledAt > RESUME_GAP_MS);
    }
    j.status = status;
  });
  if (firstSubmit) {
    await recordActivity('applied', id);
    if (wasResumed) await recordActivity('resumed', id);
  }
}

/** Unfinished applications, most recently touched first (Save and resume). */
export function unfinished(jobs: Job[]): Job[] {
  return jobs.filter((j) => j.status === 'in_progress').sort((a, b) => (b.lastFilledAt ?? b.updatedAt) - (a.lastFilledAt ?? a.updatedAt));
}

/** Saved but not started, oldest first so nothing sits forever. */
export function upNext(jobs: Job[]): Job[] {
  return jobs.filter((j) => j.status === 'saved').sort((a, b) => a.addedAt - b.addedAt);
}
