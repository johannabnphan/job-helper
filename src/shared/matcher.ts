// Pure matching logic: decides which profile value or saved answer belongs in a
// form field, given the field's label and attributes. No DOM access here, so it
// can be unit-tested and shared by every ATS adapter.
import type { Answer, Profile } from './types';

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'month'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'combobox';

export type ProfileKey =
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'fullName'
  | 'preferredName'
  | 'pronouns'
  | 'email'
  | 'phone'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'location'
  | 'linkedin'
  | 'portfolio'
  | 'github'
  | 'otherUrl'
  | 'currentCompany'
  | 'currentTitle'
  | 'workTitle'
  | 'workCompany'
  | 'workLocation'
  | 'workStartMonth'
  | 'workStartYear'
  | 'workEndMonth'
  | 'workEndYear'
  | 'workStart'
  | 'workEnd'
  | 'workCurrent'
  | 'workDescription'
  | 'school'
  | 'degree'
  | 'fieldOfStudy'
  | 'gpa'
  | 'eduStartMonth'
  | 'eduStartYear'
  | 'eduEndMonth'
  | 'eduEndYear'
  | 'eduStart'
  | 'eduEnd'
  | 'skills'
  | 'authorizedToWork'
  | 'requiresSponsorship'
  | 'workAuthStatus'
  | 'salary'
  | 'salaryMin'
  | 'salaryMax'
  | 'startDate'
  | 'gender'
  | 'race'
  | 'hispanicLatino'
  | 'veteran'
  | 'disability'
  | 'resume'
  | 'coverLetter';

/** Keys that repeat once per work-history or education entry on a form. */
export const WORK_KEYS: ProfileKey[] = [
  'workTitle', 'workCompany', 'workLocation', 'workStartMonth', 'workStartYear', 'workEndMonth', 'workEndYear',
  'workStart', 'workEnd', 'workCurrent', 'workDescription',
];
export const EDU_KEYS: ProfileKey[] = [
  'school', 'degree', 'fieldOfStudy', 'gpa', 'eduStartMonth', 'eduStartYear', 'eduEndMonth', 'eduEndYear', 'eduStart', 'eduEnd',
];

export interface FieldDescriptor {
  /** Visible question/label text. */
  label: string;
  kind: FieldKind;
  /** name / id / data-automation-id etc. Used when the label doesn't match. */
  attrs?: string;
  /** HTML autocomplete attribute, a strong signal when present. */
  autocomplete?: string;
  /** Option labels for select / radio / combobox fields. */
  options?: string[];
  /** Set by an ATS adapter that knows exactly what the field is. */
  hint?: ProfileKey;
  required?: boolean;
}

export type Confidence = 'high' | 'review';

export interface Resolution {
  value: string;
  /** "high" = fill and mark done; "review" = fill but ask the user to check. */
  confidence: Confidence;
  source: string; // human readable, e.g. "Profile: email" or "Answer: Visa sponsorship"
  key?: ProfileKey;
  reason?: string;
}

export interface Unresolved {
  reason: string;
  key?: ProfileKey;
  openEnded: boolean;
}

// ---------------------------------------------------------------------------
// Normalisation

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(required\)|\(optional\)|\*/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'+#/&-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "legalName--firstName" / "first_name" -> "legal name first name". */
export function humanize(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-[\].]+/g, ' ')
    .replace(/\d+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Label rules. Order matters: the first rule whose pattern matches wins, so
// more specific rules come first.

interface Rule {
  key: ProfileKey;
  re: RegExp;
  not?: RegExp;
  kinds?: FieldKind[];
}

const NOT_PERSON = /refer|recruit|manager|supervisor|emergency|reference|employer|company|school|university|hiring|contact person|spouse|parent/;

const RULES: Rule[] = [
  { key: 'resume', re: /\b(resume|résumé|cv|curriculum vitae)\b/, kinds: ['file'] },
  { key: 'coverLetter', re: /cover letter/, kinds: ['file'] },

  { key: 'preferredName', re: /\b(preferred|nick) ?name\b|\bgo by\b/ },
  { key: 'firstName', re: /\b(first|given|fore) ?name\b|^first$/, not: NOT_PERSON },
  { key: 'lastName', re: /\b(last|family|sur) ?name\b|^surname$|^last$/, not: NOT_PERSON },
  { key: 'middleName', re: /\bmiddle (name|initial)\b/ },
  { key: 'pronouns', re: /\bpronouns?\b/ },

  { key: 'email', re: /\be-?mail\b/, not: /refer|recruit|manager|reference|confirm.*different|alternate/ },
  { key: 'phone', re: /\b(phone|mobile|cell|telephone)\b/, not: /type|device|extension|ext\b|country code|refer|reference/ },

  { key: 'linkedin', re: /linkedin/ },
  { key: 'github', re: /github|gitlab/ },
  { key: 'portfolio', re: /portfolio|personal (web)?site|^website$|\bwebsite\b|\bblog\b|personal url/, not: /company website/ },
  { key: 'otherUrl', re: /^(other )?(url|link)s?$|other (website|link|url)/ },

  { key: 'addressLine2', re: /address (line )?2|apartment|\bapt\b|suite|unit number/ },
  { key: 'addressLine1', re: /street|address (line )?1|^address$|mailing address|home address/, not: /e-?mail|ip address/ },
  { key: 'postalCode', re: /\b(zip|postal|post) ?code\b|^zip$/ },
  { key: 'city', re: /^city$|\bcity\b(?! and)|\btown\b/, not: /company|school/ },
  { key: 'state', re: /\bstate\b|province|\bregion\b/, not: /united states|statement|state of|states?\?|located in the|company|school/ },
  { key: 'location', re: /\blocation\b|where are you (located|based)|current(ly)? (located|based|residence)|\bbased in\b|city.*state|place of residence/, not: /prefer|willing|open to|relocat|office|work location|job location|desired/ },
  { key: 'country', re: /\bcountry\b/, not: /authori[sz]ed|eligible|citizen|visa|sponsor|phone|code|other than|outside/ },

  { key: 'requiresSponsorship', re: /sponsor|visa (status|support|transfer)|h-?1b/, kinds: ['select', 'radio', 'combobox', 'checkbox', 'text'] },
  { key: 'authorizedToWork', re: /(legally )?(authori[sz]ed|eligible|permitted|right) to work|work authori[sz]ation|employment eligibility|lawfully/, kinds: ['select', 'radio', 'combobox', 'checkbox', 'text'] },
  { key: 'workAuthStatus', re: /(citizenship|immigration|visa|work permit) status|current status/ },

  { key: 'salaryMin', re: /(minimum|min|lowest) (salary|compensation|pay)/ },
  { key: 'salaryMax', re: /(maximum|max|highest) (salary|compensation|pay)/ },
  { key: 'salary', re: /salary|compensation|pay (expectation|requirement|range)|desired pay|expected (pay|ctc)|\bctc\b/, not: /current salary|current compensation/ },
  { key: 'startDate', re: /start date|when can you start|earliest (date|start)|date available|available start|availability date|able to start/ },

  { key: 'hispanicLatino', re: /hispanic|latin[oax]/ },
  { key: 'race', re: /\brace\b|ethnicity|ethnic/ },
  { key: 'gender', re: /\bgender\b|\bsex\b/, not: /identity.*trans|transgender|sexual orientation/ },
  { key: 'veteran', re: /veteran|military|armed forces/ },
  { key: 'disability', re: /disabilit/ },

  // Education (repeats per entry)
  { key: 'school', re: /\b(school|university|college|institution)( name)?\b/, not: /high school diploma|graduate.*\?$/ },
  { key: 'fieldOfStudy', re: /field of study|\bmajor\b|discipline|area of study|concentration/ },
  { key: 'degree', re: /\bdegree\b/, not: /degree of|highest level/ },
  { key: 'gpa', re: /\bgpa\b|grade point/ },

  // Work history (repeats per entry)
  { key: 'currentCompany', re: /current (company|employer|organization)|most recent (company|employer)/ },
  { key: 'currentTitle', re: /current (job )?(title|role|position)|most recent (title|role|position)/ },
  { key: 'workCompany', re: /^(company|employer|organization)( name)?$|company name|employer name/ },
  { key: 'workTitle', re: /^(job )?title$|job title|position title|^role$|^position$/ },
  { key: 'workCurrent', re: /currently work here|current(ly)? (employed|working)|i currently/, kinds: ['checkbox'] },
  { key: 'workDescription', re: /role description|job description|responsibilities|^description$/, kinds: ['textarea'] },
  { key: 'skills', re: /^skills$|\bskills\b(?!.*\?)/, not: /describe|how|what|why/ },
];

const AUTOCOMPLETE: Record<string, ProfileKey> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  'additional-name': 'middleName',
  name: 'fullName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'address-line1': 'addressLine1',
  'street-address': 'addressLine1',
  'address-line2': 'addressLine2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
  'country-name': 'country',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'portfolio',
};

/** "Name" / "Full name" / "Your name" (but not company name etc.). */
const FULL_NAME_RE = /^(your )?(full |legal |complete )?name$|^full (legal )?name|^legal name$|^candidate name$/;

const DATE_PART = /\b(month|year|mm|yyyy|yy)\b/;

function dateKey(text: string, prefix: 'work' | 'edu'): ProfileKey | undefined {
  const isStart = /\b(start|from|began|begin)\b/.test(text);
  const isEnd = /\b(end|to|until|finish|graduat|completion|completed)\b/.test(text);
  if (!isStart && !isEnd) return undefined;
  const which = isStart && !isEnd ? 'Start' : isEnd && !isStart ? 'End' : /\bstart|from\b/.test(text) ? 'Start' : 'End';
  const part = /\bmonth|\bmm\b/.test(text) ? 'Month' : /\byear|yyyy|yy\b/.test(text) ? 'Year' : '';
  return `${prefix}${which}${part}` as ProfileKey;
}

/**
 * Figures out which profile key a field asks for.
 * `section` is a hint from the surrounding DOM ("work" / "education") used for
 * ambiguous labels like "Start date".
 */
export function matchProfileKey(field: FieldDescriptor, section?: 'work' | 'education'): ProfileKey | undefined {
  if (field.hint) return field.hint;
  const ac = field.autocomplete?.toLowerCase().split(/\s+/).pop();
  if (ac && AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac];

  const tryText = (raw: string): ProfileKey | undefined => {
    const text = normalize(raw);
    if (!text) return undefined;
    if (section && (/\b(start|end|from|to)\b.*\b(date|month|year)\b|^(month|year)$|\b(start|end|from|to)$/.test(text) || DATE_PART.test(text))) {
      const k = dateKey(text, section === 'work' ? 'work' : 'edu');
      if (k) return k;
    }
    if (section === 'work' && /^(company|employer|organization)/.test(text)) return 'workCompany';
    if (section === 'work' && /title|position|role/.test(text)) return 'workTitle';
    if (section === 'work' && /^location$/.test(text)) return 'workLocation';
    if (section === 'education' && /graduat/.test(text)) return dateKey(`end ${text}`, 'edu');
    if (FULL_NAME_RE.test(text)) return 'fullName';
    for (const rule of RULES) {
      if (rule.kinds && !rule.kinds.includes(field.kind)) continue;
      if (rule.re.test(text) && !(rule.not && rule.not.test(text))) return rule.key;
    }
    return undefined;
  };

  // Long free-text questions only match a few rules reliably; avoid "name" in
  // "Why do you want to join <company name>?" being taken as a name field.
  const label = field.label.length > 120 ? '' : field.label;
  return tryText(label) ?? (field.attrs ? tryText(humanize(field.attrs)) : undefined);
}

// ---------------------------------------------------------------------------
// Values

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Parses "Jan 2021", "01/2021", "2021-01", "2021" into month (1-12) and year. */
export function parseMonthYear(s: string): { month?: number; year?: string } {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{1,2})/);
  if (m) return { year: m[1], month: Number(m[2]) };
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { month: Number(m[1]), year: m[2] };
  m = t.match(/([a-z]{3,})\.?\s+(\d{4})/);
  if (m) {
    const idx = MONTHS.findIndex((mo) => mo.startsWith(m![1].slice(0, 3)));
    return { month: idx >= 0 ? idx + 1 : undefined, year: m[2] };
  }
  m = t.match(/\b(\d{4})\b/);
  return m ? { year: m[1] } : {};
}

function monthName(n: number | undefined): string | undefined {
  return n ? MONTHS[n - 1][0].toUpperCase() + MONTHS[n - 1].slice(1) : undefined;
}

function formatMoney(v: string, currency: string): string {
  const n = Number(v.replace(/[^\d.]/g, ''));
  if (!n) return v;
  const sym = currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
  return `${sym}${n.toLocaleString('en-US')}${sym ? '' : ` ${currency}`}`;
}

/** Returns the profile value for a key, or undefined when the profile doesn't have it. */
export function profileValue(key: ProfileKey, p: Profile, index = 0, kind: FieldKind = 'text'): string | undefined {
  const work = p.work[index];
  const edu = p.education[index];
  const v = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
  const datePart = (date: string | undefined, part: 'month' | 'year') => {
    if (!date) return undefined;
    const d = parseMonthYear(date);
    if (part === 'year') return d.year;
    // Free-text month inputs (e.g. Workday's MM box) want a number; dropdowns get the name.
    return kind === 'text' || kind === 'number' ? (d.month ? String(d.month).padStart(2, '0') : undefined) : monthName(d.month);
  };
  const isoDate = (date: string | undefined) => {
    if (!date) return undefined;
    const d = parseMonthYear(date);
    if (!d.year) return undefined;
    const mm = String(d.month ?? 1).padStart(2, '0');
    return kind === 'month' ? `${d.year}-${mm}` : kind === 'date' ? `${d.year}-${mm}-01` : date;
  };

  switch (key) {
    case 'firstName': return v(p.firstName);
    case 'lastName': return v(p.lastName);
    case 'middleName': return undefined;
    case 'fullName': return v([p.firstName, p.lastName].filter(Boolean).join(' '));
    case 'preferredName': return v(p.preferredName) ?? v(p.firstName);
    case 'pronouns': return v(p.pronouns);
    case 'email': return v(p.email);
    case 'phone': return v(p.phone);
    case 'addressLine1': return v(p.address.line1);
    case 'addressLine2': return v(p.address.line2);
    case 'city': return v(p.address.city);
    case 'state': return v(p.address.state);
    case 'postalCode': return v(p.address.postalCode);
    case 'country': return v(p.address.country);
    case 'location': return v([p.address.city, p.address.state, kind === 'combobox' ? '' : p.address.country].filter(Boolean).join(', '));
    case 'linkedin': return v(p.links.linkedin);
    case 'portfolio': return v(p.links.portfolio) ?? v(p.links.github);
    case 'github': return v(p.links.github);
    case 'otherUrl': return v(p.links.other);
    case 'currentCompany': return v(p.work[0]?.company);
    case 'currentTitle': return v(p.work[0]?.title);
    case 'workTitle': return v(work?.title);
    case 'workCompany': return v(work?.company);
    case 'workLocation': return v(work?.location);
    case 'workStartMonth': return datePart(work?.startDate, 'month');
    case 'workStartYear': return datePart(work?.startDate, 'year');
    case 'workEndMonth': return work?.current ? undefined : datePart(work?.endDate, 'month');
    case 'workEndYear': return work?.current ? undefined : datePart(work?.endDate, 'year');
    case 'workStart': return isoDate(v(work?.startDate));
    case 'workEnd': return work?.current ? undefined : isoDate(v(work?.endDate));
    case 'workCurrent': return work ? (work.current ? 'yes' : 'no') : undefined;
    case 'workDescription': return v(work?.description);
    case 'school': return v(edu?.school);
    case 'degree': return v(edu?.degree);
    case 'fieldOfStudy': return v(edu?.field);
    case 'gpa': return v(edu?.gpa);
    case 'eduStartMonth': return datePart(edu?.startDate, 'month');
    case 'eduStartYear': return datePart(edu?.startDate, 'year');
    case 'eduEndMonth': return datePart(edu?.endDate, 'month');
    case 'eduEndYear': return datePart(edu?.endDate, 'year');
    case 'eduStart': return isoDate(v(edu?.startDate));
    case 'eduEnd': return isoDate(v(edu?.endDate));
    case 'skills': return p.skills.length ? p.skills.join(', ') : undefined;
    case 'authorizedToWork': return v(p.workAuth.authorizedToWork);
    case 'requiresSponsorship': return v(p.workAuth.requiresSponsorship);
    case 'workAuthStatus': return v(p.workAuth.status);
    case 'salaryMin': return kind === 'number' ? v(p.salary.min) : p.salary.min ? formatMoney(p.salary.min, p.salary.currency) : undefined;
    case 'salaryMax': return kind === 'number' ? v(p.salary.max) : p.salary.max ? formatMoney(p.salary.max, p.salary.currency) : undefined;
    case 'salary': {
      const { min, max, currency, period } = p.salary;
      if (kind === 'number') return v(min) ?? v(max);
      if (!min && !max) return undefined;
      const range = min && max ? `${formatMoney(min, currency)} – ${formatMoney(max, currency)}` : formatMoney(min || max, currency);
      return `${range} per ${period}`;
    }
    case 'startDate': return v(p.startDate);
    case 'gender': return v(p.eeo.gender);
    case 'race': return v(p.eeo.race);
    case 'hispanicLatino': return v(p.eeo.hispanicLatino);
    case 'veteran': return v(p.eeo.veteran);
    case 'disability': return v(p.eeo.disability);
    case 'resume':
    case 'coverLetter':
      return undefined; // handled by the file filler
  }
}

// ---------------------------------------------------------------------------
// Answer bank

/** Light stemming so "relocate" also matches "relocating" / "relocation". */
function stem(word: string): string {
  return word.length >= 5 ? word.replace(/(ations?|ions?|ing|ed|es|e|s)$/, '') : word;
}

function keywordIn(text: string, keyword: string): boolean {
  const k = normalize(keyword);
  if (!k) return false;
  const words = k.split(' ');
  const last = words.pop()!;
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lastStem = stem(last);
  const pattern = [...words.map(escape), lastStem === last ? escape(last) : `${escape(lastStem)}\\p{L}*`].join(' ');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/** Best answer whose keywords appear in the label. Longer keyword matches win. */
export function matchAnswer(label: string, answers: Answer[]): Answer | undefined {
  const text = normalize(label);
  let best: { a: Answer; score: number } | undefined;
  for (const a of answers) {
    if (!a.answer.trim()) continue;
    let score = 0;
    for (const k of a.keywords) if (keywordIn(text, k)) score += normalize(k).length + 5;
    if (score && (!best || score > best.score)) best = { a, score };
  }
  return best?.a;
}

/** Saved answers whose keywords match but which are still blank (so we can say why we flagged). */
export function matchBlankAnswer(label: string, answers: Answer[]): Answer | undefined {
  const text = normalize(label);
  return answers.find((a) => !a.answer.trim() && a.keywords.some((k) => keywordIn(text, k)));
}

const OPEN_ENDED_RE =
  /\b(why|describe|tell us|tell me|explain|what (excites|interests|draws|motivates|makes)|cover letter|additional information|anything else|how would you|how do you|share|walk us through|in your own words|what would you|example of|elaborate)\b/;

export function isOpenEnded(field: FieldDescriptor): boolean {
  if (field.kind === 'file' || field.kind === 'select' || field.kind === 'radio' || field.kind === 'checkbox' || field.kind === 'combobox') return false;
  const text = normalize(field.label);
  return OPEN_ENDED_RE.test(text) || (field.kind === 'textarea' && text.length > 25);
}

// ---------------------------------------------------------------------------
// Picking an option in a select / radio group / combobox

const US_STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', dc: 'district of columbia', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois',
  in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana',
  ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york',
  nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah',
  vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
};

const ALIAS_GROUPS: string[][] = [
  ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a', 'america'],
  ['united kingdom', 'uk', 'u k', 'great britain', 'england'],
  ['decline to self-identify', 'decline to self identify', 'i don\'t wish to answer', 'prefer not to say', 'prefer not to answer', 'decline', 'i do not wish to answer', 'choose not to disclose', 'i don\'t wish to disclose'],
  ['man', 'male'],
  ['woman', 'female'],
  ['linkedin', 'linked in'],
];

function aliasesOf(s: string): string[] {
  const n = normalize(s);
  const out = new Set([n]);
  for (const group of ALIAS_GROUPS) if (group.includes(n)) group.forEach((g) => out.add(g));
  if (US_STATES[n]) out.add(US_STATES[n]);
  for (const [abbr, name] of Object.entries(US_STATES)) if (name === n) out.add(abbr);
  return [...out];
}

const DEGREE_LEVELS: Array<[RegExp, RegExp]> = [
  [/^(ph ?d|doctor|doctorate|dphil|ed ?d)/, /doctor|ph ?d/],
  [/^(mba)$/, /mba|master of business|master's|masters/],
  [/^(m ?s|m ?a|m ?sc|m ?eng|m ?f ?a|master)/, /master/],
  [/^(b ?s|b ?a|b ?sc|b ?eng|b ?f ?a|bachelor)/, /bachelor/],
  [/^(associate|a ?a|a ?s)\b/, /associate/],
  [/^(high school|ged|diploma)/, /high school|ged|diploma/],
];

const YES_RE = /^(yes|y|true|i am|i do|i will|i have|i can|authori[sz]ed|correct)\b/;
const NO_RE = /^(no|n|false|i am not|i do not|i don't|i will not|i won't|i have not|i cannot|not)\b/;

export interface OptionPick {
  index: number;
  exact: boolean;
}

/**
 * Chooses the option that best matches `desired`. Handles yes/no answers,
 * "Decline to self-identify" variants, US state abbreviations, country
 * aliases, degree levels and month names.
 */
export function pickOption(options: string[], desired: string): OptionPick | undefined {
  const opts = options.map(normalize);
  const want = normalize(desired);
  if (!want) return undefined;
  const real = (i: number) => opts[i] && !/^(select|choose|please select|--|none selected)/.test(opts[i]);

  // 1. Exact (including aliases).
  const aliases = aliasesOf(desired);
  for (let i = 0; i < opts.length; i++) if (real(i) && aliases.includes(opts[i])) return { index: i, exact: true };

  // 2. Yes / No.
  const yes = YES_RE.test(want);
  const no = NO_RE.test(want);
  if (yes !== no) {
    const re = yes ? YES_RE : NO_RE;
    const i = opts.findIndex((o, j) => real(j) && re.test(o));
    if (i >= 0) return { index: i, exact: want === 'yes' || want === 'no' };
  }

  // 3. Decline-type answers.
  if (/decline|prefer not|don't wish|do not wish|not to disclose|rather not/.test(want)) {
    const i = opts.findIndex((o, j) => real(j) && /decline|prefer not|don't wish|do not wish|not to disclose|rather not|not specified/.test(o));
    if (i >= 0) return { index: i, exact: true };
  }

  // 4. Degree levels ("BFA" -> "Bachelor's Degree").
  for (const [wantRe, optRe] of DEGREE_LEVELS) {
    if (wantRe.test(want)) {
      const i = opts.findIndex((o, j) => real(j) && optRe.test(o));
      if (i >= 0) return { index: i, exact: false };
    }
  }

  // 5. Month names / numbers ("January" vs "01" vs "Jan").
  const mi = MONTHS.findIndex((m) => m === want || m.slice(0, 3) === want);
  if (mi >= 0) {
    const i = opts.findIndex((o, j) => real(j) && (o === MONTHS[mi] || o === MONTHS[mi].slice(0, 3) || Number(o) === mi + 1));
    if (i >= 0) return { index: i, exact: true };
  }

  // 6. Prefix / containment (both directions), preferring the closest length.
  let best: { i: number; d: number } | undefined;
  for (let i = 0; i < opts.length; i++) {
    if (!real(i)) continue;
    const o = opts[i];
    for (const a of aliases) {
      if (a.length < 2) continue;
      if (o.startsWith(a) || a.startsWith(o) || (a.length >= 4 && o.includes(a)) || (o.length >= 4 && a.includes(o))) {
        const d = Math.abs(o.length - a.length);
        if (!best || d < best.d) best = { i, d };
      }
    }
  }
  if (best) return { index: best.i, exact: false };

  // 7. Word overlap ("Brooklyn, NY" -> "Brooklyn, New York, United States").
  const words = want.split(' ').filter((w) => w.length > 1).map((w) => US_STATES[w] ?? w);
  if (words.length > 1) {
    let top: { i: number; score: number } | undefined;
    for (let i = 0; i < opts.length; i++) {
      if (!real(i)) continue;
      const hits = words.filter((w) => keywordIn(opts[i], w)).length;
      const score = hits / words.length;
      if (score >= 0.6 && (!top || score > top.score)) top = { i, score };
    }
    if (top) return { index: top.i, exact: false };
  }

  // 8. Free-text answers: use the first sentence / first words.
  const first = want.split(/[.,;:—–-]\s/)[0];
  if (first !== want) return pickOption(options, first);
  return undefined;
}

// ---------------------------------------------------------------------------
// Top-level resolution

export interface ResolveContext {
  profile: Profile;
  answers: Answer[];
  /** Index of the work / education entry this field belongs to (0-based). */
  index?: number;
  section?: 'work' | 'education';
}

export function resolveField(field: FieldDescriptor, ctx: ResolveContext): Resolution | Unresolved {
  const openEnded = isOpenEnded(field);
  const key = matchProfileKey(field, ctx.section);

  if (key === 'resume' || key === 'coverLetter') {
    return { reason: key === 'resume' ? 'Resume upload' : 'Cover letter: attach or write one yourself', key, openEnded: false };
  }

  if (key && !openEnded) {
    const value = profileValue(key, ctx.profile, ctx.index ?? 0, field.kind);
    if (value !== undefined) return { value, key, confidence: 'high', source: `From profile: ${humanize(key)}` };
  }

  const answer = matchAnswer(field.label, ctx.answers);
  if (answer) {
    return {
      value: answer.answer.trim(),
      confidence: openEnded ? 'review' : 'high',
      source: `From answer bank: ${answer.question || answer.keywords[0]}`,
      reason: openEnded ? 'Open-ended question filled from your answer bank. Tailor it to this role.' : undefined,
    };
  }

  if (key && openEnded) {
    // e.g. a "Skills" textarea; fill but ask for review.
    const value = profileValue(key, ctx.profile, ctx.index ?? 0, field.kind);
    if (value !== undefined) return { value, key, confidence: 'review', source: `From profile: ${humanize(key)}`, reason: 'Long-form field. Check the wording.' };
  }

  if (openEnded) return { reason: 'Open-ended question. Write this one yourself.', openEnded: true };
  if (key) return { reason: `Add your ${humanize(key)} to your profile`, key, openEnded: false };
  const blank = matchBlankAnswer(field.label, ctx.answers);
  if (blank) return { reason: `Answer bank entry "${blank.question}" is empty`, openEnded: false };
  return { reason: 'No confident match', openEnded: false };
}

export function isResolved(r: Resolution | Unresolved): r is Resolution {
  return 'value' in r;
}
