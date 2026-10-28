// Service worker: opens the side panel from the toolbar icon, runs the
// keyboard shortcut, and fills in job titles when a saved job's tab loads.
import { fillTab } from '../shared/fill-tab';
import { findJob, titleFromTab } from '../shared/jobs';
import { getJobs, saveJobs } from '../shared/storage';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-current-page' || !tab) return;
  try {
    await fillTab(tab);
  } catch (err) {
    console.warn('[Job Helper]', err);
  }
});

chrome.tabs.onUpdated.addListener(async (_tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !tab.title) return;
  const jobs = await getJobs();
  const job = findJob(jobs, tab.url);
  if (!job || job.title) return;
  job.title = titleFromTab(tab.title);
  job.updatedAt = Date.now();
  await saveJobs(jobs);
});
