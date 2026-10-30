// Runs autofill in a tab: injects the content script into every frame, sends
// the profile, answers and resume, and gathers each frame's report.
// Used by the side panel button and the keyboard shortcut.
import { addUrls, findJob, titleFromTab } from './jobs';
import type { FillPayload, FillReport } from './messages';
import { getResume } from './resume-store';
import { getAnswers, getJobs, getProfile, recordActivity, saveJobs } from './storage';

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface TabFillResult {
  reports: FillReport[];
  counts: { filled: number; review: number; missing: number; skipped: number };
}

export async function fillTab(tab: chrome.tabs.Tab): Promise<TabFillResult> {
  if (!tab.id || !tab.url || !/^https?:|^file:/.test(tab.url)) throw new Error("Job Helper can't run on this page.");
  const [profile, answers, resume] = await Promise.all([getProfile(), getAnswers(), getResume()]);
  const payload: FillPayload = {
    profile,
    answers,
    resume: resume ? { name: resume.name, type: resume.type, base64: await blobToBase64(resume.data) } : undefined,
  };

  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['content.js'] });
  const results = await chrome.scripting.executeScript({
    target,
    func: (p: FillPayload) => window.__jobHelper?.fill(p),
    args: [payload],
  });

  const reports = results.map((r) => r.result as FillReport | undefined).filter((r): r is FillReport => Boolean(r && (r.fields.length || r.error)));
  const counts = { filled: 0, review: 0, missing: 0, skipped: 0 };
  for (const r of reports) for (const f of r.fields) counts[f.status]++;

  // Track it in the job list: mark as Filled (adding it if it isn't there yet).
  if (counts.filled + counts.review >= 2) {
    let jobs = await getJobs();
    if (!findJob(jobs, tab.url)) jobs = addUrls(jobs, [tab.url]).jobs;
    const job = findJob(jobs, tab.url)!;
    if (job.status === 'to_apply') job.status = 'filled';
    await recordActivity('filled', job.id);
    if (!job.title && tab.title) job.title = titleFromTab(tab.title);
    job.updatedAt = Date.now();
    await saveJobs(jobs);
  }
  return { reports, counts };
}

export async function clearHighlights(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => window.__jobHelper?.clear() });
}
