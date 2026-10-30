// App actions that reach into the browser: opening a job and running the
// existing autofill on it.
import { unfinished, upNext } from '../shared/applications';
import { fillTab, type TabFillResult } from '../shared/fill-tab';
import { getBuddy, getJobs, saveBuddy } from '../shared/storage';
import type { Job } from '../shared/types';

/** The job "Start Applying" should open: an unfinished one first, then the oldest saved one. */
export async function nextJob(): Promise<Job | undefined> {
  const jobs = await getJobs();
  return unfinished(jobs)[0] ?? upNext(jobs)[0];
}

function waitForLoad(tabId: number, timeout = 30000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('The page took too long to load.'));
    }, timeout);
    const listener = (id: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export type OpenResult =
  | { kind: 'filled'; result: TabFillResult }
  | { kind: 'no-form' } // posting page: user needs to click the site's Apply button first
  | { kind: 'error'; message: string };

/**
 * Opens a job in a new tab and runs autofill once it loads. ApplyBuddy never
 * submits; the user reviews and submits in that tab.
 */
export async function openAndFill(job: Job): Promise<OpenResult> {
  const b = await getBuddy();
  await saveBuddy({ ...b, focusJobId: job.id });
  try {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    const loaded = await waitForLoad(tab.id!);
    await new Promise((r) => setTimeout(r, 800)); // let single-page apps render the form
    const result = await fillTab(await chrome.tabs.get(loaded.id!));
    const { filled, review, missing } = result.counts;
    return filled + review + missing ? { kind: 'filled', result } : { kind: 'no-form' };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Opens without filling (e.g. to read the posting). */
export function openJob(job: Job): void {
  void chrome.tabs.create({ url: job.url, active: true });
}
