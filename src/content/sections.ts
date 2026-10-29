// Repeating sections ("Add experience", "Add education"): make the form show
// one block per entry in the profile before filling, so every job and school
// gets filled in order.
import type { FillPayload } from '../shared/messages';
import { matchProfileKey, type ProfileKey } from '../shared/matcher';
import type { Adapter } from './adapters/types';
import { collectFields, isVisible, sectionOf, text, toDescriptor } from './fields';
import { closestDeep, deepQueryAll, hostOf } from './dom';
import { couldSubmit, safeClick } from './fill';

type Kind = 'work' | 'education';

const SPEC: Record<Kind, { keys: ProfileKey[]; add: RegExp; title: string }> = {
  work: {
    keys: ['workCompany', 'workTitle'],
    add: /\badd\b.*\b(work|experience|employment|position|job|role|employer|company)\b|\b(work experience|employment)\b.*\badd\b/i,
    title: 'work experience',
  },
  education: {
    keys: ['school', 'degree'],
    add: /\badd\b.*\b(education|school|degree|university|college)\b|\beducation\b.*\badd\b/i,
    title: 'education',
  },
};

const GENERIC_ADD = /^\+?\s*add(\s+(another|more|new|one more))?\s*\+?$/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many blocks of this kind the form shows: the most-repeated key field. */
function countBlocks(doc: Document, adapter: Adapter, kind: Kind): number {
  const counts = new Map<ProfileKey, number>();
  for (const f of collectFields(doc, adapter)) {
    const key = matchProfileKey(toDescriptor(f), f.section);
    if (key && SPEC[kind].keys.includes(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/** Visible text of a button; for a button inside a web component, the host's slotted text. */
function buttonText(b: HTMLElement): string {
  return text(b) || (b.querySelector('slot') ? text(hostOf(b)) : '');
}

function addLabel(b: HTMLElement): string {
  return `${b.getAttribute('aria-label') ?? ''} ${buttonText(b)} ${b.getAttribute('data-automation-id') ?? ''}`.trim();
}

/** The "Add …" button for a section, or undefined. Never anything that could submit. */
export function findAddButton(doc: Document, kind: Kind): HTMLElement | undefined {
  const candidates = deepQueryAll<HTMLElement>(doc, 'button, [role="button"]').filter(
    (b) => isVisible(b) && !couldSubmit(b) && !b.closest('[data-job-helper]') && !(b as HTMLButtonElement).disabled,
  );
  const explicit = candidates.find((b) => SPEC[kind].add.test(addLabel(b)));
  if (explicit) return explicit;
  // A plain "Add" / "+ Add another" button under a Work Experience / Education heading.
  return candidates.find((b) => {
    const label = buttonText(b) || b.getAttribute('aria-label') || '';
    if (!GENERIC_ADD.test(label) && b.getAttribute('data-automation-id') !== 'add-button') return false;
    const group = closestDeep(b, '[role="group"], section, fieldset');
    const heading = group ? text(group.querySelector('h1, h2, h3, h4, legend, [role="heading"]')).toLowerCase() : '';
    const section = /experience|employment|work history/.test(heading) ? 'work' : /education/.test(heading) ? 'education' : sectionOf(b);
    return section === kind;
  });
}

export interface SectionNote {
  anchor: HTMLElement;
  message: string;
}

/**
 * Clicks Add until the form has as many blocks as the profile has entries,
 * waiting for each new block to render. Returns notes for anything it
 * couldn't do (no Add button, block didn't appear).
 */
export async function expandSections(doc: Document, adapter: Adapter, payload: FillPayload): Promise<SectionNote[]> {
  const notes: SectionNote[] = [];
  const wanted: Record<Kind, number> = { work: payload.profile.work.length, education: payload.profile.education.length };

  for (const kind of ['work', 'education'] as Kind[]) {
    const want = wanted[kind];
    if (!want) continue;
    let have = countBlocks(doc, adapter, kind);
    const button = findAddButton(doc, kind);
    if (have >= want) continue;
    if (!button) {
      // The form has no such section at all: nothing to add.
      if (have === 0) continue;
      notes.push({ anchor: doc.body, message: `Your profile has ${want} ${SPEC[kind].title} entries but the form shows ${have}; no Add button found` });
      continue;
    }

    for (let attempt = 0; have < want && attempt < want + 2; attempt++) {
      const btn = findAddButton(doc, kind) ?? button;
      if (!safeClick(btn)) break;
      // Wait for the new block to render.
      const before = have;
      for (let t = 0; t < 30 && have <= before; t++) {
        await sleep(100);
        have = countBlocks(doc, adapter, kind);
      }
      if (have <= before) break;
    }
    if (have < want) {
      notes.push({
        anchor: findAddButton(doc, kind) ?? button,
        message: `Added ${SPEC[kind].title} blocks but only ${have} of ${want} appeared. Click Add, then Fill again`,
      });
    }
  }
  return notes;
}
