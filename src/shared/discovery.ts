// Find Jobs: real openings from companies' public job boards (Greenhouse,
// Lever, Ashby). No scraping, no invented listings: if a field isn't in the
// posting, it's shown as not listed. Matching is explained in words, never as
// a made-up percentage.
import type { JobSearchPrefs } from './prefs';
import type { Profile } from './types';

export type BoardKind = 'greenhouse' | 'lever' | 'ashby';

export interface Board {
  kind: BoardKind;
  slug: string;
}

export interface Listing {
  /** Stable id: "<kind>:<slug>:<posting id>". */
  id: string;
  board: string;
  company: string;
  title: string;
  location: string;
  url: string;
  employmentType?: string;
  workplace?: string;
  salary?: string;
  /** Plain-text description. */
  description: string;
  postedAt?: string;
}

export interface Match {
  /** Higher is better; only used for ordering. */
  rank: number;
  titleMatch: boolean;
  fits: string[];
  gaps: string[];
  requirements: string[];
  summary: string;
  why: string;
}

// ---------------------------------------------------------------------------
// Boards

/** Accepts "greenhouse:acme", a board URL, or a job URL from that board. */
export function parseBoard(input: string): Board | undefined {
  const t = input.trim();
  const short = t.match(/^(greenhouse|lever|ashby):([\w.-]+)$/i);
  if (short) return { kind: short[1].toLowerCase() as BoardKind, slug: short[2] };
  try {
    const u = new URL(/^https?:\/\//.test(t) ? t : `https://${t}`);
    const seg = u.pathname.split('/').filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
      const slug = seg[0] === 'embed' ? u.searchParams.get('for') : seg[0];
      return slug ? { kind: 'greenhouse', slug } : undefined;
    }
    if (/(^|\.)lever\.co$/.test(u.hostname) && seg[0]) return { kind: 'lever', slug: seg[0] };
    if (/(^|\.)ashbyhq\.com$/.test(u.hostname) && seg[0]) return { kind: 'ashby', slug: seg[0] };
  } catch {
    /* not a URL */
  }
  return undefined;
}

export function boardKey(b: Board): string {
  return `${b.kind}:${b.slug}`;
}

export function boardUrl(b: Board): string {
  return b.kind === 'greenhouse'
    ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}/jobs?content=true`
    : b.kind === 'lever'
      ? `https://api.lever.co/v0/postings/${encodeURIComponent(b.slug)}?mode=json`
      : `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.slug)}?includeCompensation=true`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** HTML (possibly entity-escaped, as Greenhouse returns it) to readable plain text. */
export function htmlToText(html: string): string {
  return decodeEntities(decodeEntities(html))
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalize(b: Board, data: any, companyName?: string): Listing[] {
  const company = companyName || titleCase(b.slug);
  const key = boardKey(b);
  if (b.kind === 'greenhouse') {
    return (data?.jobs ?? []).map((j: any) => ({
      id: `${key}:${j.id}`,
      board: key,
      company: j.company_name || company,
      title: String(j.title ?? '').trim(),
      location: j.location?.name ?? '',
      url: j.absolute_url,
      description: htmlToText(j.content ?? ''),
      postedAt: j.first_published ?? j.updated_at,
    }));
  }
  if (b.kind === 'lever') {
    return (Array.isArray(data) ? data : []).map((j: any) => {
      const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content ?? '')}`).join('\n\n');
      const sr = j.salaryRange;
      const per: Record<string, string> = { 'per-year-salary': 'a year', 'per-month-salary': 'a month', 'per-hour-wage': 'an hour', 'per-week-salary': 'a week' };
      const salary = sr?.min && sr?.max ? `${fmtMoney(sr.min, sr.currency)} – ${fmtMoney(sr.max, sr.currency)}${sr.interval ? ` ${per[sr.interval] ?? humanInterval(sr.interval)}` : ''}` : undefined;
      return {
        id: `${key}:${j.id}`,
        board: key,
        company,
        title: String(j.text ?? '').trim(),
        location: j.categories?.location ?? (j.categories?.allLocations ?? []).join(', '),
        url: j.hostedUrl,
        employmentType: j.categories?.commitment,
        workplace: j.workplaceType && j.workplaceType !== 'unspecified' ? j.workplaceType : undefined,
        salary,
        description: [j.descriptionPlain ?? htmlToText(j.description ?? ''), lists].filter(Boolean).join('\n\n').trim(),
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      };
    });
  }
  return (data?.jobs ?? [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => ({
      id: `${key}:${j.id}`,
      board: key,
      company,
      title: String(j.title ?? '').trim(),
      location: [j.location, ...(j.secondaryLocations ?? []).map((l: any) => l.location)].filter(Boolean).join(', '),
      url: j.jobUrl,
      employmentType: j.employmentType ? humanInterval(j.employmentType) : undefined,
      workplace: j.workplaceType ? String(j.workplaceType).toLowerCase() : j.isRemote ? 'remote' : undefined,
      salary: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || undefined,
      description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ''),
      postedAt: j.publishedAt,
    }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function fmtMoney(n: number, currency?: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

function humanInterval(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase().replace(/^per /, 'per ').replace(/^(\w)/, (c) => c.toUpperCase());
}

export class BoardError extends Error {}

/** Fetches one board's openings. Throws BoardError with a readable message. */
export async function fetchBoard(b: Board, fetchImpl: typeof fetch = fetch): Promise<Listing[]> {
  let res: Response;
  try {
    res = await fetchImpl(boardUrl(b), { headers: { Accept: 'application/json' } });
  } catch {
    throw new BoardError(`Couldn't reach ${b.kind} for "${b.slug}". Check your connection.`);
  }
  if (res.status === 404) throw new BoardError(`No ${titleCase(b.kind)} job board called "${b.slug}". Check the name in the company's careers link.`);
  if (!res.ok) throw new BoardError(`${titleCase(b.kind)} returned an error (${res.status}) for "${b.slug}".`);
  const data = await res.json();
  let company: string | undefined;
  if (b.kind === 'greenhouse') {
    try {
      const meta = await fetchImpl(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}`);
      if (meta.ok) company = (await meta.json())?.name;
    } catch {
      /* name is optional */
    }
  }
  return normalize(b, data, company).filter((l) => l.title && l.url);
}

// ---------------------------------------------------------------------------
// Matching

const STOP = new Set(['and', 'or', 'the', 'of', 'a', 'an', 'to', 'for', 'in', 'ii', 'iii', 'i', 'sr', 'jr']);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w));

function contains(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, 'i').test(text);
}

/** Rough years of experience from the profile's work history. */
export function profileYears(p: Profile, now = new Date()): number {
  let months = 0;
  for (const w of p.work) {
    const start = w.startDate.match(/(\d{4})/);
    const end = w.current ? String(now.getFullYear()) : w.endDate.match(/(\d{4})/)?.[1];
    if (start && end) months += Math.max(0, (Number(end) - Number(start[1])) * 12);
  }
  return Math.round(months / 12);
}

const REQ_LINE = /(\d+\+?\s*(?:-|to)?\s*\d*\s*years?|experience (?:with|in)|proficien|degree|bachelor|master|required|must have|familiar(?:ity)? with|knowledge of)/i;

export function keyRequirements(description: string): string[] {
  const lines = description
    .split(/\n|•/)
    .map((l) => l.replace(/^[\s\-–*]+/, '').trim())
    .filter((l) => l.length > 12 && l.length < 220);
  return [...new Set(lines.filter((l) => REQ_LINE.test(l)))].slice(0, 4);
}

export function summarize(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  const sentences = flat.match(/[^.!?]+[.!?]+/g) ?? [flat];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 280) break;
    out += s;
  }
  return (out || flat.slice(0, 260)).trim();
}

export function matchListing(l: Listing, prefs: JobSearchPrefs, profile: Profile): Match {
  const text = `${l.title}\n${l.description}`.toLowerCase();
  const titleWords = words(l.title);
  const titleMatch =
    !prefs.titles.length || prefs.titles.some((t) => {
      const want = words(t);
      return want.length > 0 && want.filter((w) => titleWords.includes(w)).length >= Math.ceil(want.length * 0.6);
    });
  const skills = [...new Set([...prefs.skills, ...profile.skills].map((s) => s.trim()).filter(Boolean))];
  const fitsSkills = skills.filter((s) => contains(text, s)).slice(0, 5);
  const fits: string[] = [];
  if (prefs.titles.length && titleMatch) fits.push('Matches a role you\'re looking for');
  if (fitsSkills.length) fits.push(`Mentions your skills: ${fitsSkills.join(', ')}`);
  const loc = `${l.location} ${l.workplace ?? ''}`.toLowerCase();
  const wantsRemote = prefs.workplace.includes('remote');
  if (wantsRemote && /remote/.test(loc)) fits.push('Remote');
  else if (prefs.location && contains(loc, prefs.location.split(',')[0])) fits.push(`In ${prefs.location.split(',')[0]}`);
  for (const ind of prefs.industries) if (contains(text, ind)) fits.push(`Mentions ${ind}`);

  const gaps: string[] = [];
  const yearsAsked = l.description.match(/(\d+)\+?\s*(?:-|to)?\s*(?:\d+\s*)?years?/i);
  const have = profileYears(profile);
  if (yearsAsked && profile.work.length && Number(yearsAsked[1]) > have) gaps.push(`Asks for ${yearsAsked[1]}+ years; your profile shows about ${have}`);
  if (/master'?s|phd|doctorate/i.test(l.description) && /required/i.test(l.description) && !profile.education.some((e) => /master|m\.?s|m\.?a|mba|phd|doctor/i.test(e.degree))) {
    gaps.push('May require an advanced degree');
  }
  if (prefs.workplace.length && l.workplace && !prefs.workplace.includes(l.workplace as never)) gaps.push(`${l.workplace[0].toUpperCase()}${l.workplace.slice(1)}, not your usual setup`);
  if (prefs.level === 'entry' && /\b(senior|staff|principal|lead|director)\b/i.test(l.title)) gaps.push('Title suggests a more senior level');
  if ((prefs.level === 'senior' || prefs.level === 'lead') && /\b(intern|junior|associate|entry)\b/i.test(l.title)) gaps.push('Title suggests a more junior level');

  const rank = (titleMatch ? 10 : 0) + fitsSkills.length * 2 + fits.length - gaps.length * 2;
  const why = fits.length ? fits.slice(0, 2).join('. ') + '.' : 'From a company you follow.';
  return { rank, titleMatch, fits, gaps, requirements: keyRequirements(l.description), summary: summarize(l.description), why };
}
