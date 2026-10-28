// Job list helpers: URL normalisation and company detection for ATS links.
import { uid } from './defaults';
import type { Job, JobStatus } from './types';

export const STATUS_LABELS: Record<JobStatus, string> = {
  to_apply: 'To apply',
  filled: 'Filled',
  applied: 'Applied',
};

/** Query params that identify the posting and must be kept. */
const KEEP_PARAMS = ['gh_jid', 'jobid', 'job_id', 'jid', 'id', 'token', 'jk', 'currentjobid'];

/**
 * A stable key for "the same job": ignores tracking params, hashes, and the
 * apply/application suffix that Lever and Ashby add to the posting URL.
 */
export function jobKey(raw: string): string {
  try {
    const u = new URL(raw);
    const params = [...u.searchParams.entries()]
      .filter(([k]) => KEEP_PARAMS.includes(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const path = u.pathname
      .replace(/\/+$/, '')
      .replace(/\/(apply|application|applications?\/new|login)$/i, '');
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return `${host}${path.toLowerCase()}${params.length ? `?${new URLSearchParams(params)}` : ''}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

function titleCase(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Best guess at the company from an ATS URL. */
export function companyFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const seg = u.pathname.split('/').filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(host)) {
      const i = seg[0] === 'embed' ? -1 : 0;
      return i >= 0 && seg[i] ? titleCase(seg[i]) : titleCase(u.searchParams.get('for') ?? '');
    }
    if (/(^|\.)lever\.co$/.test(host) || /(^|\.)ashbyhq\.com$/.test(host)) return seg[0] ? titleCase(seg[0]) : '';
    if (/myworkdayjobs\.com$|myworkdaysite\.com$|myworkday\.com$/.test(host)) return titleCase(host.split('.')[0]);
    if (/(^|\.)smartrecruiters\.com$/.test(host) || /(^|\.)workable\.com$/.test(host)) return seg[0] ? titleCase(seg[0]) : '';
    const parts = host.replace(/^(www|jobs|careers|boards|apply)\./, '').split('.');
    return titleCase(parts.length > 1 ? parts[parts.length - 2] : parts[0]);
  } catch {
    return '';
  }
}

export function atsName(raw: string): string | undefined {
  try {
    const host = new URL(raw).hostname;
    if (/greenhouse\.io$/.test(host)) return 'Greenhouse';
    if (/lever\.co$/.test(host)) return 'Lever';
    if (/ashbyhq\.com$/.test(host)) return 'Ashby';
    if (/myworkdayjobs\.com$|myworkdaysite\.com$|myworkday\.com$/.test(host)) return 'Workday';
  } catch {
    /* not a URL */
  }
  return undefined;
}

/** Pulls http(s) URLs out of pasted text (one per line, or mixed with other text). */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;]+$/, '')))];
}

export function newJob(url: string, title = ''): Job {
  const now = Date.now();
  return { id: uid(), url, title, company: companyFromUrl(url), status: 'to_apply', notes: '', addedAt: now, updatedAt: now };
}

/** Adds URLs that aren't already in the list. Returns the new list and how many were added. */
export function addUrls(jobs: Job[], urls: string[]): { jobs: Job[]; added: number } {
  const keys = new Set(jobs.map((j) => jobKey(j.url)));
  const fresh: Job[] = [];
  for (const url of urls) {
    const k = jobKey(url);
    if (keys.has(k)) continue;
    keys.add(k);
    fresh.push(newJob(url));
  }
  return { jobs: [...fresh, ...jobs], added: fresh.length };
}

export function findJob(jobs: Job[], url: string): Job | undefined {
  const k = jobKey(url);
  return jobs.find((j) => jobKey(j.url) === k);
}

/** Cleans a tab title like "Job Application for Designer at Acme" into a role title. */
export function titleFromTab(tabTitle: string): string {
  return tabTitle
    .replace(/^(job application for|apply for|application for|apply to|apply:)\s*/i, '')
    .replace(/\s+(at|@)\s+[^|–—-]+$/i, '')
    .replace(/\s*[|–—-]\s*(greenhouse|lever|ashby|workday|careers?|jobs?)\b.*$/i, '')
    .trim();
}
