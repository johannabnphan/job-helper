// Fills one document (frame) in four steps:
//   1. expand repeating sections (click "Add experience" / "Add education")
//   2. fill every field from the profile and answer bank (resume upload last)
//   3. wait for the page to settle (sites parse the resume and autofill)
//   4. self-check: re-read every field, correct anything wrong or empty, and
//      flag what can't be fixed.
// It never relies on the site's own resume autofill, and never submits.
import type { FieldReport, FillPayload, FillReport } from '../shared/messages';
import {
  EDU_KEYS,
  isOpenEnded,
  WEAK_OPTION,
  WORK_KEYS,
  isResolved,
  matchProfileKey,
  normalize,
  parseMonthYear,
  pickBestOption,
  resolveField,
  type ProfileKey,
  type Resolution,
  type Unresolved,
} from '../shared/matcher';
import type { Adapter } from './adapters/types';
import { collectFields, toDescriptor, type FieldHandle } from './fields';
import {
  base64ToFile,
  readValue,
  setButtonChoice,
  setCheckbox,
  setCombobox,
  setFile,
  setRadio,
  setSelect,
  setValue,
  typeText,
} from './fill';
import { overlay, type Mark } from './overlay';
import type { DraftRequest, DraftResponse } from '../shared/ai';
import { eventTarget } from './dom';
import { jobPageText } from './job-text';
import { expandSections } from './sections';

const YES = /^(yes|y|true|i agree|i do|i am|i have|i will)\b/i;
const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?$/;
const END_KEYS: ProfileKey[] = ['workEnd', 'workEndMonth', 'workEndYear'];
const DATE_KEYS: ProfileKey[] = ['workStart', 'workEnd', 'eduStart', 'eduEnd'];

/**
 * Elements the user typed into or changed themselves. Never overwritten.
 * Clicking a checkbox from script fires a *trusted* change event, so events
 * while we are writing are ignored.
 */
const userEdited = new WeakSet<EventTarget>();
let writing = 0;
for (const type of ['input', 'change']) {
  document.addEventListener(type, (e) => {
    const t = eventTarget(e);
    if (!writing && e.isTrusted && t) userEdited.add(t);
  }, true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function short(label: string): string {
  const t = label.replace(/[\s*✱]+$/, '').trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t || '(unlabeled field)';
}

/** Formats a profile date for a free-text date box, following its placeholder (MM/YYYY etc.). */
export function formatDateFor(raw: string, hint: string): string {
  const d = parseMonthYear(raw);
  if (!d.year) return raw;
  const mm = String(d.month ?? 1).padStart(2, '0');
  const h = hint.toLowerCase();
  if (/mm\s*\/\s*dd\s*\/\s*yyyy/.test(h)) return `${mm}/01/${d.year}`;
  if (/dd\s*\/\s*mm\s*\/\s*yyyy/.test(h)) return `01/${mm}/${d.year}`;
  if (/mm\s*\/\s*yyyy/.test(h)) return `${mm}/${d.year}`;
  if (/mm\s*\/\s*yy\b/.test(h)) return `${mm}/${d.year.slice(2)}`;
  if (/yyyy\s*-\s*mm/.test(h)) return `${d.year}-${mm}`;
  return raw;
}

interface Plan {
  f: FieldHandle;
  key?: ProfileKey;
  res: Resolution | Unresolved;
  /** The value first, then alternate wordings, for option matching. */
  wordings: string[];
  /** Set when the field should be left alone, with the reason. */
  skip?: string;
}

function plan(fields: FieldHandle[], payload: FillPayload): Plan[] {
  const counters = new Map<ProfileKey, number>();
  return fields.map((f) => {
    const desc = toDescriptor(f);
    const key = matchProfileKey(desc, f.section);
    desc.hint = key;
    let index = f.index;
    if (index === undefined && key && (WORK_KEYS.includes(key) || EDU_KEYS.includes(key))) {
      index = counters.get(key) ?? 0;
      counters.set(key, index + 1);
    }
    const res = resolveField(desc, { profile: payload.profile, answers: payload.answers, index, section: f.section });
    const p: Plan = { f, key, res, wordings: [] };

    if (key && END_KEYS.includes(key) && payload.profile.work[index ?? 0]?.current) p.skip = 'Current role: no end date';
    if (userEdited.has(f.el) || f.choices?.some((c) => userEdited.has(c))) p.skip = 'You edited this; left as is';

    if (isResolved(res)) {
      if (key && DATE_KEYS.includes(key) && (f.kind === 'text' || f.kind === 'combobox')) {
        res.value = formatDateFor(res.value, `${f.el.getAttribute('placeholder') ?? ''} ${f.label}`);
      }
      p.wordings = [res.value, ...(res.variants ?? [])];
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// Comparing what the field shows with what it should show

function canon(v: string): string {
  return normalize(v.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, ''));
}

/** 0 = wrong/empty, otherwise how well the current value matches (1 = exactly). */
function matchScore(p: Plan, current: string): number {
  if (!isResolved(p.res) || !current) return 0;
  const { f, res } = p;
  switch (f.kind) {
    case 'checkbox':
      return (current === 'yes') === YES.test(res.value) ? 1 : 0;
    case 'select':
    case 'radio':
    case 'combobox':
      return pickBestOption([current], p.wordings)?.score ?? 0;
    case 'file':
      return 1;
    case 'tel':
      return current.replace(/\D/g, '').endsWith(res.value.replace(/\D/g, '').slice(-10)) ? 1 : 0;
    case 'date':
    case 'month':
      return current === (f.kind === 'month' ? res.value.slice(0, 7) : res.value) ? 1 : 0;
    default:
      if (canon(current) === canon(res.value)) return 1;
      return f.kind === 'text' && p.key === 'phone' && current.replace(/\D/g, '') === res.value.replace(/\D/g, '') ? 1 : 0;
  }
}

function read(p: Plan): string {
  return readValue(p.f.kind, p.f.el, p.f.choices, p.f.options);
}

/** Sets the planned value. Returns a reason string on failure. */
async function apply(p: Plan): Promise<string | undefined> {
  writing++;
  try {
    return await applyValue(p);
  } finally {
    writing--;
  }
}

async function applyValue(p: Plan): Promise<string | undefined> {
  const { f } = p;
  if (!isResolved(p.res)) return p.res.reason;
  const value = p.res.value;
  switch (f.kind) {
    case 'select':
      return setSelect(f.el as HTMLSelectElement, p.wordings) ? undefined : `No option matches "${value}"`;
    case 'radio':
      return f.choices && f.options && setRadio(f.choices as HTMLInputElement[], f.options, p.wordings) ? undefined : `No option matches "${value}"`;
    case 'checkbox':
      setCheckbox(f.el as HTMLInputElement, YES.test(value));
      return undefined;
    case 'combobox': {
      const pick = f.choices ? setButtonChoice(f.choices, p.wordings) : await setCombobox(f.el, p.wordings);
      return pick ? undefined : `Choose "${value}" (or the closest option) yourself`;
    }
    case 'date':
    case 'month':
      if (!ISO_DATE.test(value)) return `Enter a date (your profile says "${value}")`;
      setValue(f.el as HTMLInputElement, f.kind === 'month' ? value.slice(0, 7) : value);
      return undefined;
    case 'file':
      return undefined;
    default: {
      const el = f.el as HTMLInputElement | HTMLTextAreaElement;
      setValue(el, value);
      // Some sites ignore a pasted value and only accept typing: type it instead.
      if (canon(el.value) !== canon(value)) await typeText(el, value);
      return undefined;
    }
  }
}

/** Waits until the DOM stops changing (or `max` ms pass): sites re-render after a resume upload. */
function settle(doc: Document, quietMs: number, max: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, quietMs);
    const stop = setTimeout(done, max);
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    obs.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() {
      obs.disconnect();
      clearTimeout(timer);
      clearTimeout(stop);
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------

export async function fillDocument(doc: Document, adapter: Adapter, payload: FillPayload): Promise<FillReport> {
  const resume = payload.resume ? base64ToFile(payload.resume.base64, payload.resume.name, payload.resume.type) : undefined;

  // 1. Make room for every job and school in the profile.
  const notes = await expandSections(doc, adapter, payload);

  // 2. Fill. Remember what was there before so replaced values can be reported.
  const replaced = new WeakMap<HTMLElement, string>();
  const failed = new WeakMap<HTMLElement, string>();
  const first = plan(collectFields(doc, adapter), payload);
  for (const p of first) {
    if (p.skip || p.f.kind === 'file' || !isResolved(p.res)) continue;
    try {
      const before = read(p);
      if (matchScore(p, before) >= WEAK_OPTION) continue; // already right
      if (before) replaced.set(p.f.el, before);
      const err = await apply(p);
      if (err) failed.set(p.f.el, err);
    } catch (err) {
      console.warn('[Job Helper] failed on field', p.f, err);
      failed.set(p.f.el, 'Could not fill this field automatically');
    }
  }

  // Resume last: some sites parse it and overwrite fields, which step 4 corrects.
  let attached = false;
  for (const p of first) {
    if (p.f.kind !== 'file' || p.key !== 'resume' || !resume || p.skip) continue;
    const input = p.f.el as HTMLInputElement;
    writing++;
    if (!input.files?.length && setFile(input, resume)) attached = true;
    writing--;
  }

  // 3. Let the site react (resume parsing, conditional questions appearing).
  await settle(doc, attached ? 800 : 300, attached ? 5000 : 1500);

  // 4. Self-check: fresh scan, compare, correct once, then report.
  const reports: FieldReport[] = [];
  const marks: Mark[] = [];
  const record = (p: Plan, status: FieldReport['status'], detail: string, value?: string) => {
    const { f } = p;
    const label = short(f.label);
    reports.push({ label, status, detail, value });
    if (status === 'skipped') return;
    const canDraft = (f.kind === 'textarea' || f.kind === 'text') && ((!isResolved(p.res) && p.res.openEnded) || (isResolved(p.res) && p.res.confidence === 'review' && isOpenEnded(toDescriptor(f))));
    marks.push({
      anchor: f.anchor,
      watch: f.el,
      status,
      label,
      message: status === 'filled' ? detail : `${status === 'review' ? 'Review' : 'Needs you'}: ${detail}`,
      resolved: () => read(p) !== '',
      draft: canDraft ? () => draftInto(f) : undefined,
    });
  };

  for (const p of plan(collectFields(doc, adapter), payload)) {
    const { f, res } = p;
    try {
      if (p.skip) {
        record(p, 'skipped', p.skip);
        continue;
      }

      if (f.kind === 'file') {
        const has = (f.el as HTMLInputElement).files?.length;
        if (p.key === 'resume') {
          if (has) record(p, 'filled', `Attached ${(f.el as HTMLInputElement).files![0].name}`);
          else record(p, 'missing', resume ? 'Could not attach your resume. Upload it yourself.' : 'No resume saved in Job Helper. Upload it yourself.');
        } else if (!has && (f.required || p.key === 'coverLetter')) {
          record(p, 'missing', isResolved(res) ? 'Upload a file' : res.reason);
        }
        continue;
      }

      if (!isResolved(res)) {
        if (read(p) && f.kind !== 'checkbox') {
          // Something (you or the site) filled it and we have nothing to compare with.
          if (!res.openEnded) continue;
          record(p, 'review', 'Filled by the site. Check it, or write your own answer.');
          continue;
        }
        if (f.kind === 'checkbox' && !f.required) continue;
        const optional = !f.required && !res.openEnded && !res.key;
        record(p, optional ? 'review' : 'missing', optional ? `Optional: ${res.reason.toLowerCase()}` : res.reason);
        continue;
      }

      let current = read(p);
      let score = matchScore(p, current);
      let corrected = false;
      if (score < WEAK_OPTION) {
        // Wrong, empty, or changed by the site's own autofill: set it again.
        const err = await apply(p);
        await sleep(150);
        current = read(p);
        const after = matchScore(p, current);
        corrected = after > score && after > 0;
        score = after;
        if (!score) {
          const why = err ?? failed.get(f.el);
          record(p, 'missing', why ?? (current ? `Shows "${current}" but should be "${res.value}". Fix it yourself.` : `Couldn't set "${res.value}". Fill it yourself.`));
          continue;
        }
      }

      const old = replaced.get(f.el);
      if (res.confidence === 'review' || f.review) {
        record(p, 'review', res.confidence === 'review' ? (res.reason ?? 'Check this answer') : f.review!, current);
      } else if (score < WEAK_OPTION) {
        record(p, 'review', `Closest option chosen for "${res.value}". Check it.`, current);
      } else if (old && canon(old) !== canon(current)) {
        record(p, 'review', `Replaced "${old.slice(0, 40)}" (filled by the site or earlier) with your profile value`, current);
      } else {
        record(p, 'filled', corrected ? `${res.source} (corrected after the site changed it)` : res.source, current);
      }
    } catch (err) {
      console.warn('[Job Helper] self-check failed on field', f, err);
      record(p, 'missing', 'Could not check this field. Review it yourself.');
    }
  }

  for (const note of [...notes, ...(adapter.notes?.(doc, payload) ?? [])]) {
    reports.push({ label: adapter.name, status: 'missing', detail: note.message });
    marks.push({ anchor: note.anchor, watch: note.anchor, status: 'missing', message: `Needs you: ${note.message}` });
  }

  if (marks.length) overlay.show(marks);
  return { url: location.href, adapter: adapter.name, fields: reports };
}

/** Asks the service worker for an AI draft and puts it in the field. Returns an error message on failure. */
async function draftInto(f: FieldHandle): Promise<string | undefined> {
  const el = f.el as HTMLInputElement | HTMLTextAreaElement;
  const req: DraftRequest = {
    type: 'jh:draft',
    question: f.label,
    maxLength: el.maxLength > 0 ? el.maxLength : undefined,
    jobText: jobPageText(),
    pageTitle: document.title,
    pageUrl: location.href,
  };
  let res: DraftResponse | undefined;
  try {
    res = (await chrome.runtime.sendMessage(req)) as DraftResponse | undefined;
  } catch (err) {
    return `Couldn't reach Job Helper (${String(err)}). Reload the page and try again.`;
  }
  if (!res) return 'No response. Reload the page and try again.';
  if (!res.ok) return res.error;
  writing++;
  try {
    setValue(el, res.text);
    if (canon(el.value) !== canon(res.text)) await typeText(el, res.text);
  } finally {
    writing--;
  }
  return undefined;
}
