import '../shared/ui.css';
import './sidepanel.css';
import { clearHighlights, fillTab, type TabFillResult } from '../shared/fill-tab';
import { addUrls, atsName, extractUrls, STATUS_LABELS } from '../shared/jobs';
import { setStatus } from '../shared/applications';
import { cheer } from '../shared/buddy';
import { getBuddy, getJobs, getProfile, onStorageChange, recordActivity, saveJobs } from '../shared/storage';
import { buddyCard, type BuddyActions } from './buddy-view';
import type { Job, JobStatus } from '../shared/types';
import { h, toast } from '../shared/ui';

const app = document.getElementById('app')!;
let filter: JobStatus | 'all' = 'saved';
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

async function fillCurrentPage(): Promise<void> {
  const t = await activeTab();
  if (!t) return;
  document.querySelectorAll<HTMLButtonElement>('[data-fill]').forEach((b) => {
    b.disabled = true;
    b.textContent = 'Filling…';
  });
  try {
    liveFlags.clear();
    lastResult = { url: t.url ?? '', result: await fillTab(t) };
    const { filled, review, missing } = lastResult.result.counts;
    if (!filled && !review && !missing) toast('No application form found on this page.', 'error');
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
  }
  await render();
}

async function pageCard(): Promise<HTMLElement> {
  const tab = await activeTab();
  const profile = await getProfile();
  const ready = Boolean(profile.firstName && profile.email);
  const host = tab?.url ? (() => { try { return new URL(tab.url).hostname; } catch { return ''; } })() : '';
  const ats = tab?.url ? atsName(tab.url) : undefined;

  const fillBtn = h('button', { class: 'primary', disabled: !tab?.id, 'data-fill': '' }, 'Fill this page');
  fillBtn.addEventListener('click', () => fillCurrentPage());

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
      result ? h('button', { onclick: async () => { const t = await activeTab(); if (t?.id) await clearHighlights(t.id); lastResult = undefined; liveFlags.clear(); await render(); } }, 'Clear highlights') : null,
    ),
    result ? resultView(result) : h('p', { class: 'muted small', style: 'margin:0' }, 'Fills the form from your profile and answer bank, then highlights what to check. You click Submit yourself.'),
  );
}

interface Flag {
  label: string;
  status: string;
  detail: string;
}

/** Open flags per frame, reported live by the page as you fix fields. */
const liveFlags = new Map<string, Flag[]>();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'jh:flags') return;
  void activeTab().then((t) => {
    if (!t || sender.tab?.id !== t.id) return;
    liveFlags.set(String(msg.frameUrl), msg.flags as Flag[]);
    void render();
  });
});

async function jumpTo(label: string): Promise<void> {
  const t = await activeTab();
  if (!t?.id) return;
  await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, func: (l: string) => window.__jobHelper?.focus(l), args: [label] });
}

function resultView(r: TabFillResult): HTMLElement {
  const flagged: Flag[] = liveFlags.size
    ? [...liveFlags.values()].flat()
    : r.reports.flatMap((rep) => rep.fields.filter((f) => f.status === 'review' || f.status === 'missing'));
  const fixed = r.counts.review + r.counts.missing - flagged.length;
  return h(
    'div',
    { class: 'stack', style: 'gap:8px' },
    h(
      'div',
      { class: 'counts' },
      h('span', { class: 'count filled' }, `${r.counts.filled + Math.max(0, fixed)} done`),
      h('span', { class: 'count review' }, `${flagged.filter((f) => f.status === 'review').length} to review`),
      h('span', { class: 'count missing' }, `${flagged.filter((f) => f.status === 'missing').length} need you`),
    ),
    flagged.length
      ? h(
          'ul',
          { class: 'flags' },
          flagged.map((f) =>
            h(
              'li',
              { class: `${f.status} clickable`, title: 'Show this field', onclick: () => jumpTo(f.label) },
              h('strong', {}, f.label),
              h('div', { class: 'muted small' }, f.detail),
            ),
          ),
        )
      : h('p', { class: 'small', style: 'margin:0;font-weight:600' }, 'Everything is checked ✓ Submit it on the page when you\'re ready.'),
    h('p', { class: 'muted small', style: 'margin:0' }, 'Click an item to jump to it. Items disappear as you fix them.'),
  );
}

// ---------------------------------------------------------------------------
// Job list

function jobRow(job: Job, jobs: Job[]): HTMLElement {
  const status = h(
    'select',
    { class: `status ${job.status}`, onchange: async (e: Event) => {
        const status = (e.target as HTMLSelectElement).value as JobStatus;
        await setStatus(job.id, status);
      } },
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
  const input = h('textarea', { rows: 2, placeholder: 'Paste job links, one per line', id: 'links-input' });
  const add = async () => {
    const urls = extractUrls(input.value);
    if (!urls.length) return toast('No links found. Paste full https:// URLs.', 'error');
    const res = addUrls(jobs, urls);
    await saveJobs(res.jobs);
    for (const j of res.jobs.slice(0, res.added)) await recordActivity('job_added', j.id);
    input.value = '';
    toast(res.added ? `Added ${res.added} job${res.added > 1 ? 's' : ''}` : 'Already in your list');
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add();
  });

  const tabs: Array<JobStatus | 'all'> = ['saved', 'in_progress', 'applied', 'all'];
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

const buddyActions: BuddyActions = {
  openProfile: () => openOptions('#profile'),
  fillPage: () => void fillCurrentPage(),
  openJob: (url) => void chrome.tabs.create({ url }),
  focusAddLinks: () => {
    const el = document.getElementById('links-input');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  },
  markApplied: (jobId) => setStatus(jobId, 'applied'),
};

/** "+50 XP · Nice work!" pop when Buddy's XP goes up. */
let lastXp: number | undefined;
async function celebrate(): Promise<void> {
  const { xp } = await getBuddy();
  if (lastXp !== undefined && xp > lastXp) {
    const pop = h('div', { class: 'xp-pop', role: 'status' }, `+${xp - lastXp} XP · ${cheer(xp)}`);
    document.body.append(pop);
    setTimeout(() => pop.remove(), 2400);
  }
  lastXp = xp;
}

async function render(): Promise<void> {
  const tab = await activeTab();
  const [buddy, page, jobs] = await Promise.all([buddyCard(tab?.url, buddyActions), pageCard(), jobsCard()]);
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
    h('main', { class: 'stack' }, buddy, page, jobs),
  );
}

onStorageChange(['jobs', 'profile', 'buddy'], () => {
  void celebrate();
  void render();
});
void celebrate();
chrome.tabs.onActivated.addListener(() => {
  liveFlags.clear();
  void render();
});
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete' || info.title) void render();
});
await render();
