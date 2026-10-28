// Fills one document (frame): find fields, resolve values, set them, flag the rest.
import type { FieldReport, FillPayload, FillReport } from '../shared/messages';
import { EDU_KEYS, WORK_KEYS, isResolved, matchProfileKey, resolveField, type ProfileKey } from '../shared/matcher';
import type { Adapter } from './adapters/types';
import { collectFields, toDescriptor, type FieldHandle } from './fields';
import {
  base64ToFile,
  comboboxHasValue,
  hasValue,
  setButtonChoice,
  setCheckbox,
  setCombobox,
  setFile,
  setRadio,
  setSelect,
  setValue,
} from './fill';
import { overlay, type Mark } from './overlay';

const YES = /^(yes|y|true|i agree|i do|i am|i have|i will)\b/i;
const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

function short(label: string): string {
  const t = label.replace(/[\s*✱]+$/, '').trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t || '(unlabeled field)';
}

/** Whether the field already holds something (we never overwrite your input). */
function alreadyAnswered(f: FieldHandle): boolean {
  switch (f.kind) {
    case 'radio':
      return (f.choices as HTMLInputElement[]).some((r) => r.checked);
    case 'combobox':
      return f.choices
        ? f.choices.some((b) => b.getAttribute('aria-pressed') === 'true' || /\b_?(active|selected)/i.test(b.className))
        : comboboxHasValue(f.el);
    case 'checkbox':
      return false;
    default:
      return hasValue(f.el);
  }
}

export async function fillDocument(doc: Document, adapter: Adapter, payload: FillPayload): Promise<FillReport> {
  const fields = collectFields(doc, adapter);
  const reports: FieldReport[] = [];
  const marks: Mark[] = [];
  const counters = new Map<ProfileKey, number>();
  const resume = payload.resume ? base64ToFile(payload.resume.base64, payload.resume.name, payload.resume.type) : undefined;

  const record = (f: FieldHandle, status: FieldReport['status'], detail: string, value?: string) => {
    reports.push({ label: short(f.label), status, detail, value });
    if (status !== 'skipped') marks.push({ anchor: f.anchor, watch: f.el, status, message: status === 'filled' ? detail : `${status === 'review' ? 'Review' : 'Needs you'}: ${detail}` });
  };

  for (const f of fields) {
    try {
      const desc = toDescriptor(f);
      const key = matchProfileKey(desc, f.section);
      desc.hint = key;
      let index = f.index;
      if (index === undefined && key && (WORK_KEYS.includes(key) || EDU_KEYS.includes(key))) {
        index = counters.get(key) ?? 0;
        counters.set(key, index + 1);
      }

      if (f.kind !== 'file' && alreadyAnswered(f)) {
        record(f, 'skipped', 'Already filled; left as is');
        continue;
      }

      const res = resolveField(desc, { profile: payload.profile, answers: payload.answers, index, section: f.section });

      if (f.kind === 'file') {
        if (key === 'resume' && resume) {
          const input = f.el as HTMLInputElement;
          if (input.files?.length) record(f, 'skipped', 'A file is already attached');
          else if (setFile(input, resume)) record(f, 'filled', `Attached ${resume.name}`);
          else record(f, 'missing', 'Could not attach your resume. Upload it manually.');
        } else if (key === 'resume') {
          record(f, 'missing', 'No resume saved in Job Helper. Upload it manually.');
        } else if (f.required || key === 'coverLetter') {
          record(f, 'missing', isResolved(res) ? 'Upload a file' : res.reason);
        }
        continue;
      }

      if (!isResolved(res)) {
        // Optional checkboxes we don't recognise (newsletters etc.) aren't worth flagging.
        if (f.kind === 'checkbox' && !f.required) continue;
        // Unknown optional fields are worth a look but don't block anything.
        const optional = !f.required && !res.openEnded && !res.key;
        record(f, optional ? 'review' : 'missing', optional ? `Optional: ${res.reason.toLowerCase()}` : res.reason);
        continue;
      }

      const review = res.confidence === 'review' || Boolean(f.review);
      const reviewReason = res.confidence === 'review' ? (res.reason ?? 'Check this answer') : (f.review ?? 'Check this answer');
      const done = (fuzzy = false, shown = res.value) =>
        record(f, review || fuzzy ? 'review' : 'filled', review ? reviewReason : fuzzy ? `Closest option chosen for "${res.value}"` : res.source, shown);

      switch (f.kind) {
        case 'select': {
          const pick = setSelect(f.el as HTMLSelectElement, res.value);
          if (pick) done(!pick.exact, f.options?.[pick.index]);
          else record(f, 'missing', `No option matches "${res.value}"`);
          break;
        }
        case 'radio': {
          const pick = f.choices && f.options ? setRadio(f.choices as HTMLInputElement[], f.options, res.value) : undefined;
          if (pick) done(!pick.exact, f.options?.[pick.index]);
          else record(f, 'missing', `No option matches "${res.value}"`);
          break;
        }
        case 'checkbox':
          setCheckbox(f.el as HTMLInputElement, YES.test(res.value));
          done();
          break;
        case 'combobox': {
          const pick = f.choices ? setButtonChoice(f.choices, res.value) : await setCombobox(f.el, res.value);
          if (pick) done(!pick.exact, 'label' in pick ? String(pick.label) : f.options?.[pick.index]);
          else record(f, 'missing', `Choose "${res.value}" (or the closest option) manually`);
          break;
        }
        case 'date':
        case 'month':
          if (ISO_DATE.test(res.value)) {
            setValue(f.el as HTMLInputElement, f.kind === 'month' ? res.value.slice(0, 7) : res.value);
            done();
          } else record(f, 'missing', `Enter a date (your profile says "${res.value}")`);
          break;
        default:
          setValue(f.el as HTMLInputElement | HTMLTextAreaElement, res.value);
          done();
      }
    } catch (err) {
      console.warn('[Job Helper] failed on field', f, err);
      record(f, 'missing', 'Could not fill this field automatically');
    }
  }

  for (const note of adapter.notes?.(doc, payload) ?? []) {
    reports.push({ label: adapter.name, status: 'missing', detail: note.message });
    marks.push({ anchor: note.anchor, watch: note.anchor, status: 'missing', message: `Needs you: ${note.message}` });
  }

  if (marks.length) overlay.show(marks);
  return { url: location.href, adapter: adapter.name, fields: reports };
}
