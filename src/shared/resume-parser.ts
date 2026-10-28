// Heuristic resume text -> profile parser. Resumes vary a lot, so this aims to
// prefill as much as it can; the user reviews and corrects the result.
import { uid } from './defaults';
import type { EducationEntry, Profile, WorkEntry } from './types';

export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  work: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s|,;)]*)?/gi;
const LOCATION_RE = /\b([A-Z][a-zA-Z.' -]+),\s*([A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)*)\b(?:,\s*([A-Z][a-zA-Z ]+))?/;
// Stricter form for job lines, where "Title, Company" would otherwise look like a place.
const JOB_LOCATION_RE = /(?:[A-Z][a-zA-Z.' -]+,\s*[A-Z]{2}\b(?:,\s*[A-Z][a-zA-Z ]+)?|\bRemote\b)/;

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const END = `(?:${DATE}|present|current|now|today)`;
export const DATE_RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${END})`, 'i');

const SECTION_HEADINGS: Record<string, RegExp> = {
  experience: /^(?:(?:work|professional|relevant|employment)\s+)?(?:experience|history|employment)(?:\s+history)?$/i,
  education: /^education(?:\s*(?:&|and)\s*(?:training|certifications?))?$/i,
  skills: /^(?:(?:technical|core|key)\s+)?(?:skills|competencies|technologies|tools)(?:\s*(?:&|and)\s*\w+)?$/i,
  other: /^(?:summary|profile|about(?: me)?|objective|projects|certifications?|awards|publications|volunteer(?:ing)?|interests|languages|references|leadership|activities)$/i,
};

const TITLE_WORDS =
  /\b(engineer|developer|manager|designer|analyst|director|lead|intern|specialist|consultant|scientist|coordinator|associate|head|vp|vice president|officer|architect|researcher|writer|administrator|assistant|representative|strategist|producer|editor|founder|co-founder|owner|programmer|technician|advisor|recruiter|marketer|accountant|teacher|nurse|product|principal|staff|senior|junior)\b/i;
const SCHOOL_WORDS = /\b(university|college|institute|school|academy|polytechnic|universidad|université|conservatory)\b/i;
const DEGREE_RE =
  /\b(bachelor(?:'s)?(?: of [a-z]+)?|master(?:'s)?(?: of [a-z]+)?|associate(?:'s)? degree|doctor(?:ate)?|ph\.?\s?d\.?|mba|b\.?\s?s\.?c?\.?|b\.?\s?a\.?|m\.?\s?s\.?c?\.?|m\.?\s?a\.?|b\.?\s?eng\.?|m\.?\s?eng\.?|b\.?f\.?a\.?|m\.?f\.?a\.?|diploma|certificate)(?=[\s,.]|$)/i;

const BULLET_RE = /^[\s•●▪◦‣∙·*–-]+/;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function headingOf(line: string): string | undefined {
  const t = clean(line).replace(/[:•|]+$/, '').trim();
  if (t.length > 40) return undefined;
  for (const [name, re] of Object.entries(SECTION_HEADINGS)) if (re.test(t)) return name;
  return undefined;
}

function splitSections(lines: string[]): { header: string[]; sections: Record<string, string[]> } {
  const header: string[] = [];
  const sections: Record<string, string[]> = {};
  let current: string | undefined;
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      sections[h] ??= [];
      continue;
    }
    if (current) sections[current].push(line);
    else header.push(line);
  }
  return { header, sections };
}

function normalizeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function parseContact(text: string, header: string[], out: ParsedResume): void {
  out.email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  if (phone) out.phone = clean(phone);

  const withoutEmails = text.replace(new RegExp(EMAIL_RE.source, 'g'), ' ');
  for (const raw of withoutEmails.match(URL_RE) ?? []) {
    const u = raw.replace(/[.)]+$/, '');
    if (/linkedin\.com/i.test(u)) out.linkedin ??= normalizeUrl(u);
    else if (/github\.com/i.test(u)) out.github ??= normalizeUrl(u);
    else if (!/\.(?:js|ts|net|py)$/i.test(u) && /[a-z]\.[a-z]/i.test(u) && !/^\d/.test(u)) out.portfolio ??= normalizeUrl(u);
  }

  // Name: first header line that looks like 2-4 capitalised words with no contact info.
  for (const line of header.slice(0, 6)) {
    const t = clean(line.split(/[|•]/)[0]);
    if (EMAIL_RE.test(t) || PHONE_RE.test(t) || /\d|@|https?:|\.com/i.test(t)) continue;
    const words = t.split(' ');
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-ZÀ-Ý][\p{L}'.-]*$/u.test(w))) {
      out.firstName = words[0];
      out.lastName = words.slice(1).join(' ');
      break;
    }
  }

  for (const line of header.slice(0, 8)) {
    for (const part of line.split(/[|•·]/)) {
      const t = clean(part);
      if (EMAIL_RE.test(t) || /https?:|www\.|\.com/i.test(t)) continue;
      const m = t.match(LOCATION_RE);
      if (m && m[0].length >= t.length - 2) {
        out.city = clean(m[1]);
        out.state = m[2];
        if (m[3]) out.country = clean(m[3]);
        return;
      }
    }
  }
}

function splitTitleCompany(s: string): { title: string; company: string } {
  const t = clean(s.replace(/[,|–—-]\s*$/, ''));
  const at = t.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { title: clean(at[1]), company: clean(at[2]) };
  const parts = t.split(/\s+[|–—-]\s+|,\s+/).map(clean).filter(Boolean);
  if (parts.length >= 2) {
    const titleFirst = TITLE_WORDS.test(parts[0]) || !TITLE_WORDS.test(parts[1]);
    return titleFirst
      ? { title: parts[0], company: parts.slice(1).join(', ') }
      : { title: parts[1], company: [parts[0], ...parts.slice(2)].join(', ') };
  }
  return TITLE_WORDS.test(t) ? { title: t, company: '' } : { title: '', company: t };
}

function parseExperience(lines: string[]): WorkEntry[] {
  const entries: WorkEntry[] = [];
  let pending: string[] = []; // non-bullet lines seen since the last entry's description started
  let current: WorkEntry | undefined;

  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const range = line.match(DATE_RANGE_RE);
    if (range) {
      const rest = clean(line.replace(range[0], ' ').replace(/[|,–—-]\s*$/, '').replace(/^\s*[|,–—-]/, ''));
      const context = [...pending.slice(-2), rest].filter(Boolean);
      const entry: WorkEntry = {
        id: uid(),
        company: '',
        title: '',
        location: '',
        startDate: range[1],
        endDate: /present|current|now|today/i.test(range[2]) ? '' : range[2],
        current: /present|current|now|today/i.test(range[2]),
        description: '',
      };
      // Pull a location like "San Francisco, CA" out of the context lines.
      const ctx = context
        .map((c) => {
          const loc = c.match(new RegExp(`(?:^|\\s[|–—-]\\s|,\\s)(${JOB_LOCATION_RE.source})\\s*$`));
          if (loc && !entry.location) {
            entry.location = clean(loc[1]);
            return clean(c.slice(0, c.length - loc[0].length));
          }
          return c;
        })
        .filter(Boolean);
      if (ctx.length >= 2) {
        const a = splitTitleCompany(ctx[ctx.length - 2]);
        const b = splitTitleCompany(ctx[ctx.length - 1]);
        // Two lines: usually "Company" / "Title" or "Title" / "Company".
        if (a.title && a.company) Object.assign(entry, a);
        else if (TITLE_WORDS.test(ctx[ctx.length - 1]) && !TITLE_WORDS.test(ctx[ctx.length - 2]))
          Object.assign(entry, { company: ctx[ctx.length - 2], title: ctx[ctx.length - 1] });
        else Object.assign(entry, { title: a.title || ctx[ctx.length - 2], company: b.company || ctx[ctx.length - 1] });
      } else if (ctx.length === 1) {
        Object.assign(entry, splitTitleCompany(ctx[0]));
      }
      if (current) current.description = current.description.trim();
      entries.push(entry);
      current = entry;
      pending = [];
      continue;
    }
    if (BULLET_RE.test(raw) && current) {
      current.description += `${current.description ? '\n' : ''}• ${clean(raw.replace(BULLET_RE, ''))}`;
      pending = [];
    } else {
      pending.push(line);
      // A wrapped bullet continues the previous description line.
      if (current && current.description && pending.length === 1 && /^[a-z]/.test(line)) {
        current.description += ` ${line}`;
        pending = [];
      }
    }
  }
  return entries;
}

function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];
  let current: EducationEntry | undefined;
  const fresh = (): EducationEntry => ({ id: uid(), school: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' });

  for (const raw of lines) {
    let line = clean(raw.replace(BULLET_RE, ''));
    if (!line) continue;
    const range = line.match(DATE_RANGE_RE);
    const single = !range ? line.match(new RegExp(`(?:^|\\s)(${DATE})\\s*$`, 'i')) : null;
    const gpa = line.match(/\bGPA:?\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/i);

    const hasSchool = SCHOOL_WORDS.test(line);
    const degree = line.match(DEGREE_RE);
    if (hasSchool && (!current || current.school)) {
      current = fresh();
      entries.push(current);
    } else if (!current && (degree || range || single)) {
      current = fresh();
      entries.push(current);
    }
    if (!current) continue;

    if (range) {
      current.startDate = range[1];
      current.endDate = range[2];
      line = clean(line.replace(range[0], ''));
    } else if (single) {
      current.endDate = single[1];
      line = clean(line.replace(single[0], ''));
    }
    if (gpa) {
      current.gpa = gpa[1].replace(/\s/g, '');
      line = clean(line.replace(gpa[0], ''));
    }
    for (const part of line.split(/\s+[|–—-]\s+|,\s+(?=[A-Z])/).map(clean).filter(Boolean)) {
      if (SCHOOL_WORDS.test(part) && !current.school) current.school = part.replace(/[,;]$/, '');
      else if (DEGREE_RE.test(part) && !current.degree) {
        const m = part.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
        if (m && DEGREE_RE.test(m[1])) {
          current.degree = clean(m[1]);
          current.field = clean(m[2]).replace(/[,;.]+$/, '');
        } else current.degree = part;
      }
    }
  }
  return entries.filter((e) => e.school || e.degree);
}

function parseSkills(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    // "Languages: Python, Go" -> drop the category label.
    const line = raw.replace(BULLET_RE, '').replace(/^[^:]{1,30}:\s*/, '');
    for (const s of line.split(/[,;|•·\t]|\s{2,}/)) {
      const t = clean(s).replace(/\.$/, '');
      if (t && t.length <= 40 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    }
  }
  return out;
}

export function parseResumeText(text: string): ParsedResume {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const { header, sections } = splitSections(lines);
  const out: ParsedResume = { work: [], education: [], skills: [] };
  parseContact(text, header.filter((l) => l.trim()), out);
  if (sections.experience) out.work = parseExperience(sections.experience);
  if (sections.education) out.education = parseEducation(sections.education);
  if (sections.skills) out.skills = parseSkills(sections.skills);
  return out;
}

/**
 * Applies parsed values onto a profile. Returns the merged profile and the list of
 * paths that were filled, so the UI can highlight them for review.
 */
export function applyParsedResume(profile: Profile, parsed: ParsedResume): { profile: Profile; changed: string[] } {
  const p: Profile = structuredClone(profile);
  const changed: string[] = [];
  const setIf = (path: string, value: string | undefined, assign: (v: string) => void) => {
    if (value) {
      assign(value);
      changed.push(path);
    }
  };
  setIf('firstName', parsed.firstName, (v) => (p.firstName = v));
  setIf('lastName', parsed.lastName, (v) => (p.lastName = v));
  setIf('email', parsed.email, (v) => (p.email = v));
  setIf('phone', parsed.phone, (v) => (p.phone = v));
  setIf('address.city', parsed.city, (v) => (p.address.city = v));
  setIf('address.state', parsed.state, (v) => (p.address.state = v));
  setIf('address.country', parsed.country, (v) => (p.address.country = v));
  setIf('links.linkedin', parsed.linkedin, (v) => (p.links.linkedin = v));
  setIf('links.github', parsed.github, (v) => (p.links.github = v));
  setIf('links.portfolio', parsed.portfolio, (v) => (p.links.portfolio = v));
  if (parsed.work.length) {
    p.work = parsed.work;
    changed.push('work');
  }
  if (parsed.education.length) {
    p.education = parsed.education;
    changed.push('education');
  }
  if (parsed.skills.length) {
    p.skills = parsed.skills;
    changed.push('skills');
  }
  return { profile: p, changed };
}
