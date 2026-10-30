// Service worker: opens the side panel from the toolbar icon, runs the
// keyboard shortcut, and fills in job titles when a saved job's tab loads.
import type { DraftRequest } from '../shared/ai';
// Static import: Chrome forbids dynamic import() in extension service workers.
import type { AskRequest } from '../shared/companion';
import { companionReply, draftAnswer, testApiKey } from './draft';
import { fillTab } from '../shared/fill-tab';
import { findJob, titleFromTab } from '../shared/jobs';
import { getJobs, saveJobs } from '../shared/storage';

chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  // First install: open the app for the short onboarding.
  if (details.reason === 'install') void chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html#onboarding') });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-current-page' || !tab) return;
  try {
    await fillTab(tab);
  } catch (err) {
    console.warn('[ApplyBuddy]', err);
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

// AI drafts: content scripts and pages ask here so the API key stays in extension storage.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'jh:draft') {
    void draftAnswer(msg as DraftRequest).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'jh:ask') {
    void companionReply(msg as AskRequest).then(sendResponse);
    return true;
  }
  if (msg?.type === 'jh:test-key') {
    void testApiKey(String(msg.apiKey)).then(sendResponse);
    return true;
  }
  return undefined;
});
