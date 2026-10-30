// My Applications: a simple tracker, not a CRM. Search, filter, update status,
// next action, deadline and optional follow-up reminder.
import { setStatus, updateJob } from '../../shared/applications';
import { icon } from '../../shared/icons';
import { addUrls, extractUrls, STATUS_LABELS, STATUS_ORDER } from '../../shared/jobs';
import { getJobs, recordActivity, saveJobs } from '../../shared/storage';
import type { Job, JobStatus } from '../../shared/types';
import { h, toast } from '../../shared/ui';
import { go } from '../router';
import type { AppState } from '../state';
import { pageHead } from './parts';

type Filter = 'active' | 'all' | JobStatus;
let filter: Filter = 'active';
let query = '';

function nextActionFor(j: Job): string {
  if (j.nextAction) return j.nextAction;
  switch (j.status) {
    case 'saved': return 'Start the application';
    case 'in_progress': return j.remaining ? `Finish: ${j.remaining} ${j.remaining === 1 ? 'field' : 'fields'} left` : 'Review and submit';
    case 'applied': return j.followUp ? `Follow up ${j.followUp}` : 'Wait to hear back';
    case 'assessment': return 'Complete the assessment';
    case 'interview': return 'Prepare for the interview';
    case 'offer': return 'Review the offer';
    case 'rejected': return 'Nothing to do. On to the next one';
  }
}

export function applications(s: AppState): HTMLElement {
  const search = h('input', { type: 'search', placeholder: 'Search company or role', 'aria-label': 'Search applications', value: query });
  const list = h('div', { class: 'apps' });
  const status = h(
    'select',
    { 'aria-label': 'Filter by status' },
    h('option', { value: 'active', selected: filter === 'active' }, 'Active'),
    h('option', { value: 'all', selected: filter === 'all' }, 'All'),
    STATUS_ORDER.map((st) => h('option', { value: st, selected: filter === st }, STATUS_LABELS[st])),
  );

  const draw = () => {
    const q = query.toLowerCase();
    const shown = s.jobs
      .filter((j) => (filter === 'all' ? true : filter === 'active' ? j.status !== 'rejected' : j.status === filter))
      .filter((j) => !q || `${j.title} ${j.company} ${j.url}`.toLowerCase().includes(q))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.updatedAt - a.updatedAt);
    list.replaceChildren(
      ...(shown.length
        ? shown.map(row)
        : [
            h(
              'div',
              { class: 'card empty' },
              icon('inbox', 28),
              h('strong', {}, s.jobs.length ? 'Nothing matches' : 'No applications yet'),
              h('span', { class: 'small' }, s.jobs.length ? 'Try a different search or filter.' : 'Save a job link or find jobs, and they will show up here.'),
            ),
          ]),
    );
  };
  search.addEventListener('input', () => {
    query = search.value;
    draw();
  });
  status.addEventListener('change', () => {
    filter = status.value as Filter;
    draw();
  });
  draw();

  const linkBox = h('textarea', { rows: 2, placeholder: 'Paste job links, one per line', 'aria-label': 'Job links' });
  const addForm = h(
    'details',
    { class: 'card', style: 'margin-bottom:16px;padding:16px' },
    h('summary', { style: 'cursor:pointer;font-weight:550' }, 'Add job links'),
    h(
      'div',
      { class: 'stack', style: 'margin-top:12px' },
      linkBox,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'primary',
            onclick: async () => {
              const urls = extractUrls(linkBox.value);
              if (!urls.length) return toast('Paste full links that start with https://', 'error');
              const res = addUrls(await getJobs(), urls);
              await saveJobs(res.jobs);
              for (const j of res.jobs.slice(0, res.added)) await recordActivity('job_added', j.id);
              toast(res.added ? `Saved ${res.added} ${res.added === 1 ? 'job' : 'jobs'}` : 'Already saved');
            },
          },
          'Save',
        ),
      ),
    ),
  );

  return h(
    'div',
    {},
    pageHead('My Applications', 'Everything you have saved, started and sent, in one calm list.'),
    addForm,
    h('div', { class: 'toolbar' }, search, status),
    list,
  );
}

function row(j: Job): HTMLElement {
  const date = j.appliedAt ? `Applied ${new Date(j.appliedAt).toLocaleDateString()}` : `Saved ${new Date(j.addedAt).toLocaleDateString()}`;
  const select = h(
    'select',
    { 'aria-label': `Status for ${j.title || j.company}` },
    STATUS_ORDER.map((st) => h('option', { value: st, selected: st === j.status }, STATUS_LABELS[st])),
  );
  select.addEventListener('change', async () => {
    await setStatus(j.id, select.value as JobStatus);
    toast(`Moved to ${STATUS_LABELS[select.value as JobStatus]}`);
  });

  const field = (label: string, input: HTMLInputElement | HTMLTextAreaElement) => h('label', { class: 'field' }, h('span', {}, label), input);
  const next = h('input', { value: j.nextAction ?? '', placeholder: nextActionFor(j) });
  const deadline = h('input', { type: 'date', value: j.deadline ?? '' });
  const follow = h('input', { type: 'date', value: j.followUp ?? '' });
  const notes = h('textarea', { rows: 2 });
  notes.value = j.notes;
  const save = async () => {
    await updateJob(j.id, (x) => {
      x.nextAction = next.value.trim() || undefined;
      x.deadline = deadline.value || undefined;
      x.followUp = follow.value || undefined;
      x.notes = notes.value;
    });
    toast('Saved');
  };
  const action =
    j.status === 'saved' || j.status === 'in_progress'
      ? h('button', { class: 'primary icon', onclick: () => go('focus', j.id) }, j.status === 'saved' ? 'Apply' : 'Resume')
      : null;

  return h(
    'article',
    { class: 'app-row' },
    h(
      'div',
      { style: 'min-width:0' },
      h('a', { class: 'title', href: j.url, target: '_blank', rel: 'noopener' }, j.title || j.company || j.url),
      h('div', { class: 'sub' }, [j.company, date].filter(Boolean).join(' · ')),
    ),
    select,
    h(
      'div',
      { class: 'small', style: 'min-width:0' },
      h('div', {}, nextActionFor(j)),
      j.deadline ? h('div', { class: 'deadline' }, `Due ${j.deadline}`) : null,
    ),
    h('div', { class: 'row' }, action),
    h(
      'details',
      { style: 'grid-column:1/-1' },
      h('summary', {}, 'Details and reminders'),
      h(
        'div',
        { class: 'app-edit' },
        field('Next action', next),
        field('Deadline', deadline),
        field('Follow-up reminder', follow),
        field('Notes', notes),
        h(
          'div',
          { class: 'row', style: 'align-self:end' },
          h('button', { class: 'primary icon', onclick: save }, 'Save'),
          h(
            'button',
            {
              class: 'ghost icon danger',
              onclick: async () => {
                if (!confirm('Remove this job from your list?')) return;
                await saveJobs((await getJobs()).filter((x) => x.id !== j.id));
              },
            },
            icon('trash', 14),
            'Remove',
          ),
        ),
      ),
    ),
  );
}
