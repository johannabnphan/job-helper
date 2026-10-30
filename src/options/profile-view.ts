// Profile editor: contact, links, work history, education, skills, work
// authorization, salary, start date, and the resume file + import.
import { uid } from '../shared/defaults';
import { applyParsedResume, parseResumeText } from '../shared/resume-parser';
import { deleteResume, getResume, saveResume } from '../shared/resume-store';
import { getProfile, saveProfile, saveResumeText } from '../shared/storage';
import type { EducationEntry, Profile, WorkEntry } from '../shared/types';
import { formatBytes, getPath, h, setPath, toast } from '../shared/ui';
import { resumeToText } from './resume-text';

type FieldDef = [path: string, label: string, opts?: { type?: string; placeholder?: string; options?: string[]; list?: string; wide?: boolean }];

const EEO_SUGGESTIONS = 'eeo-suggestions';

const SECTIONS: Array<{ title: string; hint?: string; fields: FieldDef[] }> = [
  {
    title: 'Contact',
    fields: [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['preferredName', 'Preferred name'],
      ['pronouns', 'Pronouns'],
      ['email', 'Email', { type: 'email' }],
      ['phone', 'Phone', { type: 'tel' }],
    ],
  },
  {
    title: 'Address',
    fields: [
      ['address.line1', 'Street address'],
      ['address.line2', 'Apt, suite'],
      ['address.city', 'City'],
      ['address.state', 'State / region'],
      ['address.postalCode', 'Postal code'],
      ['address.country', 'Country'],
    ],
  },
  {
    title: 'Links',
    fields: [
      ['links.linkedin', 'LinkedIn', { type: 'url', placeholder: 'https://linkedin.com/in/…' }],
      ['links.portfolio', 'Portfolio / website', { type: 'url' }],
      ['links.github', 'GitHub', { type: 'url' }],
      ['links.other', 'Other link', { type: 'url' }],
    ],
  },
  {
    title: 'Work authorization',
    fields: [
      ['workAuth.authorizedToWork', 'Legally authorized to work?', { options: ['', 'yes', 'no'] }],
      ['workAuth.requiresSponsorship', 'Need visa sponsorship now or later?', { options: ['', 'yes', 'no'] }],
      ['workAuth.status', 'Status', { placeholder: 'e.g. US citizen, green card, H-1B' }],
      ['workAuth.countries', 'Authorized in (countries)', { placeholder: 'e.g. United States' }],
    ],
  },
  {
    title: 'Compensation and availability',
    fields: [
      ['salary.min', 'Salary min', { placeholder: 'e.g. 140000' }],
      ['salary.max', 'Salary max', { placeholder: 'e.g. 170000' }],
      ['salary.currency', 'Currency'],
      ['salary.period', 'Per', { options: ['year', 'hour'] }],
      ['startDate', 'Earliest start date', { placeholder: 'e.g. 2 weeks after offer, or 2026-12-01' }],
    ],
  },
  {
    title: 'Voluntary self-identification',
    hint: 'Optional. Leave a field blank and ApplyBuddy will flag that question for you to answer on each form.',
    fields: [
      ['eeo.gender', 'Gender', { list: EEO_SUGGESTIONS }],
      ['eeo.race', 'Race / ethnicity', { list: EEO_SUGGESTIONS }],
      ['eeo.hispanicLatino', 'Hispanic or Latino?', { list: EEO_SUGGESTIONS }],
      ['eeo.veteran', 'Veteran status', { list: EEO_SUGGESTIONS }],
      ['eeo.disability', 'Disability status', { list: EEO_SUGGESTIONS }],
    ],
  },
];

const WORK_FIELDS: FieldDef[] = [
  ['title', 'Job title'],
  ['company', 'Company'],
  ['location', 'Location'],
  ['startDate', 'Start', { placeholder: 'e.g. Jan 2021' }],
  ['endDate', 'End', { placeholder: 'blank if current' }],
  ['current', 'I currently work here', { type: 'checkbox' }],
  ['description', 'Description', { type: 'textarea', wide: true }],
];

const EDU_FIELDS: FieldDef[] = [
  ['school', 'School'],
  ['degree', 'Degree', { placeholder: "e.g. Bachelor's, BFA" }],
  ['field', 'Field of study'],
  ['startDate', 'Start'],
  ['endDate', 'End / graduation'],
  ['gpa', 'GPA'],
];

export class ProfileView {
  private state!: Profile;
  private imported = new Set<string>();
  private dirty = false;
  readonly el = h('div', { class: 'stack' });
  private statusEl = h('span', { class: 'muted small' });

  async init(): Promise<void> {
    this.state = await getProfile();
    await this.render();
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) e.preventDefault();
    });
  }

  private markDirty = () => {
    this.dirty = true;
    this.statusEl.textContent = 'Unsaved changes';
  };

  /** Reads every bound input back into `state` (call before re-rendering). */
  private collect(): void {
    for (const el of this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-path]')) {
      const path = el.dataset.path!;
      if (path === 'skills') this.state.skills = el.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      else if (el instanceof HTMLInputElement && el.type === 'checkbox') setPath(this.state, path, el.checked);
      else setPath(this.state, path, el.value);
    }
  }

  private input(path: string, label: string, opts: FieldDef[2] = {}): HTMLElement {
    const value = getPath(this.state, path);
    const cls = this.imported.has(path) || [...this.imported].some((p) => path.startsWith(`${p}.`)) ? 'imported' : undefined;
    let control: HTMLElement;
    if (opts.options) {
      control = h(
        'select',
        { 'data-path': path, class: cls, onchange: this.markDirty },
        opts.options.map((o) => h('option', { value: o, selected: o === value }, o === '' ? '—' : o[0].toUpperCase() + o.slice(1))),
      );
    } else if (opts.type === 'textarea') {
      control = h('textarea', { 'data-path': path, class: cls, rows: 4, oninput: this.markDirty });
      (control as HTMLTextAreaElement).value = String(value ?? '');
    } else if (opts.type === 'checkbox') {
      return h(
        'label',
        { class: 'row small' },
        h('input', { type: 'checkbox', 'data-path': path, checked: Boolean(value), style: 'width:auto', onchange: this.markDirty }),
        label,
      );
    } else {
      control = h('input', {
        type: opts.type ?? 'text',
        'data-path': path,
        class: cls,
        placeholder: opts.placeholder,
        list: opts.list,
        oninput: this.markDirty,
      });
      (control as HTMLInputElement).value = String(value ?? '');
    }
    return h('label', { class: 'field', style: opts.wide ? 'grid-column: 1 / -1' : undefined }, h('span', {}, label), control);
  }

  private section(title: string, body: Node, hint?: string, actions?: Node): HTMLElement {
    return h(
      'section',
      { class: 'card stack' },
      h('div', { class: 'row' }, h('h2', {}, title), h('span', { class: 'spacer' }), actions),
      hint ? h('p', { class: 'muted small', style: 'margin:0' }, hint) : null,
      body,
    );
  }

  private listSection<T extends WorkEntry | EducationEntry>(
    title: string,
    key: 'work' | 'education',
    fields: FieldDef[],
    blank: () => T,
    summary: (e: T) => string,
  ): HTMLElement {
    const items = this.state[key] as T[];
    const mutate = (fn: (list: T[]) => void) => {
      this.collect();
      fn(this.state[key] as T[]);
      this.markDirty();
      void this.render();
    };
    const body = h(
      'div',
      { class: 'stack' },
      items.length === 0 ? h('p', { class: 'muted', style: 'margin:0' }, 'Nothing yet.') : null,
      items.map((item, i) =>
        h(
          'div',
          { class: 'card stack', style: 'background:var(--bg)' },
          h(
            'div',
            { class: 'row' },
            h('h3', {}, summary(item) || `Entry ${i + 1}`),
            h('span', { class: 'spacer' }),
            h('button', { class: 'icon', title: 'Move up', disabled: i === 0, onclick: () => mutate((l) => l.splice(i - 1, 0, ...l.splice(i, 1))) }, '↑'),
            h('button', { class: 'icon', title: 'Move down', disabled: i === items.length - 1, onclick: () => mutate((l) => l.splice(i + 1, 0, ...l.splice(i, 1))) }, '↓'),
            h('button', { class: 'icon danger', title: 'Remove', onclick: () => mutate((l) => l.splice(i, 1)) }, 'Remove'),
          ),
          h('div', { class: 'grid' }, fields.map(([f, label, opts]) => this.input(`${key}.${i}.${f}`, label, opts))),
        ),
      ),
    );
    const hint = key === 'work' ? 'Most recent first. The first entry is used for "current company" and "current title".' : undefined;
    return this.section(title, body, hint, h('button', { onclick: () => mutate((l) => l.push(blank())) }, '+ Add'));
  }

  private async resumeCard(): Promise<HTMLElement> {
    const resume = await getResume();
    const fileInput = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.txt,.md', style: 'display:none' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      await saveResume(file);
      // Keep the plain text too, for AI drafts.
      await resumeToText(file, file.name).then(saveResumeText).catch(() => undefined);
      toast(`Saved ${file.name}`);
      await this.rerender();
    });
    const importBtn = h('button', { class: 'primary', disabled: !resume, onclick: () => this.importResume() }, 'Import into profile');
    return this.section(
      'Resume',
      h(
        'div',
        { class: 'stack' },
        h(
          'p',
          { style: 'margin:0' },
          resume
            ? h('span', {}, h('strong', {}, resume.name), h('span', { class: 'muted' }, ` · ${formatBytes(resume.size)} · saved ${new Date(resume.savedAt).toLocaleDateString()}`))
            : h('span', { class: 'muted' }, 'No resume saved yet.'),
        ),
        h(
          'div',
          { class: 'row wrap' },
          fileInput,
          h('button', { onclick: () => fileInput.click() }, resume ? 'Replace file' : 'Upload resume'),
          importBtn,
          resume
            ? h('button', {
                class: 'danger',
                onclick: async () => {
                  if (!confirm('Remove the saved resume file?')) return;
                  await deleteResume();
                  await this.rerender();
                },
              }, 'Remove')
            : null,
        ),
      ),
      'Stored only in this browser (IndexedDB). It is attached to resume upload fields when you fill a form. Import reads PDF or text resumes.',
    );
  }

  private async importResume(): Promise<void> {
    const resume = await getResume();
    if (!resume) return;
    try {
      const text = await resumeToText(resume.data, resume.name);
      await saveResumeText(text);
      this.collect();
      const { profile, changed } = applyParsedResume(this.state, parseResumeText(text));
      if (!changed.length) {
        toast("Couldn't find anything to import from this file.", 'error');
        return;
      }
      this.state = profile;
      this.imported = new Set(changed);
      this.markDirty();
      await this.render();
      toast(`Imported ${changed.length} fields. Review the highlighted fields, then click Save.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  private async rerender(): Promise<void> {
    this.collect();
    await this.render();
  }

  private async save(): Promise<void> {
    this.collect();
    await saveProfile(this.state);
    this.dirty = false;
    this.imported.clear();
    this.statusEl.textContent = 'Saved';
    await this.render();
    toast('Profile saved');
  }

  async render(): Promise<void> {
    const resume = await this.resumeCard();
    const skills = h('textarea', { 'data-path': 'skills', rows: 3, class: this.imported.has('skills') ? 'imported' : undefined, oninput: this.markDirty });
    skills.value = this.state.skills.join(', ');

    const [contact, address, links, auth, comp, eeo] = SECTIONS.map((s) =>
      this.section(s.title, h('div', { class: 'grid' }, s.fields.map(([p, l, o]) => this.input(p, l, o))), s.hint),
    );

    const children: Array<HTMLElement | null> = [
      this.imported.size
        ? h('div', { class: 'banner' }, 'Imported from your resume. Check the highlighted fields and correct anything that looks wrong, then Save.')
        : null,
      resume,
      contact,
      address,
      links,
      this.listSection<WorkEntry>(
        'Work history',
        'work',
        WORK_FIELDS,
        () => ({ id: uid(), company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' }),
        (e) => [e.title, e.company].filter(Boolean).join(' · '),
      ),
      this.listSection<EducationEntry>(
        'Education',
        'education',
        EDU_FIELDS,
        () => ({ id: uid(), school: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' }),
        (e) => [e.degree, e.school].filter(Boolean).join(' · '),
      ),
      this.section('Skills', h('label', { class: 'field' }, h('span', {}, 'Comma-separated'), skills)),
      auth,
      comp,
      eeo,
      h(
        'datalist',
        { id: EEO_SUGGESTIONS },
        ['Decline to self-identify', 'I don\'t wish to answer', 'Yes', 'No', 'I am not a protected veteran'].map((v) => h('option', { value: v })),
      ),
      h(
        'div',
        { class: 'savebar row' },
        this.statusEl,
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary', onclick: () => this.save() }, 'Save profile'),
      ),
    ];
    this.el.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
  }
}
