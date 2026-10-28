import '../shared/ui.css';
import './sidepanel.css';
import { clearHighlights, fillTab, type TabFillResult } from '../shared/fill-tab';
import { addUrls, atsName, extractUrls, STATUS_LABELS } from '../shared/jobs';
import { getJobs, getProfile, onStorageChange, saveJobs } from '../shared/storage';
import type { Job, JobStatus } from '../shared/types';
import { h, toast } from '../shared/ui';

const app = document.getElementById('app')!;
let filter: JobStatus | 'all' = 'to_apply';
let lastResult: { url: string; result: TabFillResult } | undefined;

function openOptions(hash = ''): void {
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html${hash}`) });
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ---------------------------------------------------------------------------
// "This page" card

async function pageCard(): Promise<HTMLElement> {
  const tab = await activeTab();
  const profile = await getProfile();
  const ready = Boolean(profile.firstName && profile.email);
  const host = tab?.url ? (() => { try { return new URL(tab.url).hostname; } catch { return ''; } })() : '';
  const ats = tab?.url ? atsName(tab.url) : undefined;

  const fillBtn = h('button', { class: 'primary', disabled: !tab?.id }, 'Fill this page');
  fillBtn.addEventListener('click', async () => {
    const t = await activeTab();
    if (!t) return;
    fillBtn.disabled = true;
    fillBtn.textContent = 'Filling…';
    try {
      lastResult = { url: t.url ?? '', result: await fillTab(t) };
      const { filled, review, missing } = lastResult.result.counts;
      if (!filled && !review && !missing) toast('No application form found on this page.', 'error');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    await render();
  });

  const result = lastResult && lastResult.url === tab?.url ? lastResult.result : undefined;
  return h(
    'section',
    { class: 'card stack' },
    h('div', { class: 'row' }, h('h2', {}, 'This page'), h('span', { class: 'spacer' }), ats ? h('span', { class: 'pill' }, ats) : null),
    h('div', { class: 'muted small ellipsis', title: tab?.url ?? '' }, tab?.title || host || 'No page'),
    !ready
      ? h('div', { class: 'banner small' }, 'Add your name and email to your profile first. ', h('button', { class: 'link', onclick: () => openOptions('#profile') }, 'Open profile'))
      : null,
    h(
      'div',
      { class: 'row' },
      fillBtn,
      result ? h('button', { onclick: async () => { const t = await activeTab(); if (t?.id) await clearHighlights(t.id); lastResult = undefined; await render(); } }, 'Clear highlights') : null,
    ),
    result ? resultView(result) : h('p', { class: 'muted small', style: 'margin:0' }, 'Fills the form from your profile and answer bank, then highlights what to check. You click Submit yourself.'),
  );
}

function resultView(r: TabFillResult): HTMLElement {
  const flagged = r.reports.flatMap((rep) => rep.fields.filter((f) => f.status === 'review' || f.status === 'missing'));
  return h(
    'div',
    { class: 'stack', style: 'gap:8px' },
    h(
      'div',
      { class: 'counts' },
      h('span', { class: 'count filled' }, `${r.counts.filled} filled`),
      h('span', { class: 'count review' }, `${r.counts.review} to review`),
      h('span', { class: 'count missing' }, `${r.counts.missing} need you`),
    ),
    flagged.length
      ? h(
          'ul',
          { class: 'flags' },
          flagged.map((f) => h('li', { class: f.status }, h('strong', {}, f.label), h('div', { class: 'muted small' }, f.detail))),
        )
      : null,
    h('p', { class: 'muted small', style: 'margin:0' }, 'Review everything on the page before you submit.'),
  );
}

// ---------------------------------------------------------------------------
// Job list

function jobRow(job: Job, jobs: Job[]): HTMLElement {
  const save = async (fn: (j: Job) => void) => {
    fn(job);
    job.updatedAt = Date.now();
    await saveJobs(jobs);
  };
  const status = h(
    'select',
    { class: `status ${job.status}`, onchange: (e: Event) => save((j) => (j.status = (e.target as HTMLSelectElement).value as JobStatus)) },
    (Object.keys(STATUS_LABELS) as JobStatus[]).map((s) => h('option', { value: s, selected: s === job.status }, STATUS_LABELS[s])),
  );
  let path = job.url;
  try { const u = new URL(job.url); path = u.hostname + u.pathname; } catch { /* keep raw */ }
  return h(
    'li',
    { class: 'job' },
    h(
      'div',
      { class: 'job-main' },
      h('a', { href: job.url, class: 'job-title', title: job.url, onclick: (e: Event) => { e.preventDefault(); chrome.tabs.create({ url: job.url }); } }, job.title || path),
      h('div', { class: 'muted small ellipsis' }, [job.company, atsName(job.url)].filter(Boolean).join(' · ') || path),
    ),
    h(
      'div',
      { class: 'row', style: 'gap:4px' },
      status,
      h('button', { class: 'icon', title: 'Open in a new tab', onclick: () => chrome.tabs.create({ url: job.url }) }, 'Open'),
      h('button', { class: 'icon danger', title: 'Remove from list', 'aria-label': 'Remove', onclick: async () => { await saveJobs(jobs.filter((j) => j.id !== job.id)); } }, '×'),
    ),
  );
}

async function jobsCard(): Promise<HTMLElement> {
  const jobs = await getJobs();
  const input = h('textarea', { rows: 2, placeholder: 'Paste job links, one per line' });
  const add = async () => {
    const urls = extractUrls(input.value);
    if (!urls.length) return toast('No links found. Paste full https:// URLs.', 'error');
    const res = addUrls(jobs, urls);
    await saveJobs(res.jobs);
    input.value = '';
    toast(res.added ? `Added ${res.added} job${res.added > 1 ? 's' : ''}` : 'Already in your list');
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add();
  });

  const tabs: Array<JobStatus | 'all'> = ['to_apply', 'filled', 'applied', 'all'];
  const count = (s: JobStatus | 'all') => (s === 'all' ? jobs.length : jobs.filter((j) => j.status === s).length);
  const visible = jobs.filter((j) => filter === 'all' || j.status === filter);

  return h(
    'section',
    { class: 'card stack' },
    h('div', { class: 'row' }, h('h2', {}, 'Job links')),
    h('div', { class: 'stack', style: 'gap:6px' }, input, h('div', { class: 'row' }, h('button', { onclick: add }, 'Add links'), h('span', { class: 'muted small' }, 'Ctrl/⌘ + Enter'))),
    h(
      'div',
      { class: 'filters' },
      tabs.map((s) =>
        h('button', { class: filter === s ? 'active' : '', onclick: async () => { filter = s; await render(); } }, `${s === 'all' ? 'All' : STATUS_LABELS[s]} ${count(s)}`),
      ),
    ),
    visible.length
      ? h('ul', { class: 'jobs' }, visible.map((j) => jobRow(j, jobs)))
      : h('p', { class: 'muted small', style: 'margin:0' }, jobs.length ? 'Nothing here.' : 'Paste job links above to start your list.'),
  );
}

// ---------------------------------------------------------------------------

async function render(): Promise<void> {
  const [page, jobs] = await Promise.all([pageCard(), jobsCard()]);
  app.replaceChildren(
    h(
      'header',
      { class: 'top row' },
      h('img', { src: '../../icons/icon32.png', width: 20, height: 20, alt: '' }),
      h('h1', {}, 'Job Helper'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon', onclick: () => openOptions('#answers') }, 'Answers'),
      h('button', { class: 'icon', onclick: () => openOptions('#profile') }, 'Profile'),
    ),
    h('main', { class: 'stack' }, page, jobs),
  );
}

onStorageChange(['jobs', 'profile'], () => void render());
chrome.tabs.onActivated.addListener(() => void render());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete' || info.title) void render();
});
await render();
