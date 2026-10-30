// Small reusable pieces shared by several screens.
import { icon } from '../../shared/icons';
import { atsName, STATUS_LABELS } from '../../shared/jobs';
import type { Job, JobStatus } from '../../shared/types';
import { h } from '../../shared/ui';
import { go } from '../router';

/** Status colors are decoration only; the text label always says the status. */
export const STATUS_COLOR: Record<JobStatus, string> = {
  saved: '#b8ab9c',
  in_progress: '#d9b25c',
  applied: '#7d9a7d',
  assessment: '#8a7fb5',
  interview: '#1d3047',
  offer: '#4b654b',
  rejected: '#b4382f',
};

export function statusChip(s: JobStatus): HTMLElement {
  return h('span', { class: 'chip' }, h('span', { class: 'status-dot', style: `background:${STATUS_COLOR[s]}`, 'aria-hidden': 'true' }), STATUS_LABELS[s]);
}

/** Compact job card: company, title, location, salary (only if stated), why it fits. */
export function jobMini(j: Job): HTMLElement {
  return h(
    'article',
    { class: 'job-mini' },
    h('div', { class: 'small', style: 'color:var(--espresso);font-weight:550' }, j.company || atsName(j.url) || 'Company'),
    h('strong', {}, j.title || 'Job posting'),
    h(
      'div',
      { class: 'meta' },
      j.location ? h('span', {}, icon('pin', 14), j.location) : null,
      j.salary ? h('span', {}, icon('wallet', 14), j.salary) : h('span', {}, icon('wallet', 14), 'Salary not listed'),
    ),
    j.why ? h('p', { class: 'reason' }, j.why) : null,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'primary icon', onclick: () => go('focus', j.id) }, 'Apply'),
      h('a', { class: 'btn icon', href: j.url, target: '_blank', rel: 'noopener' }, 'Review', icon('external', 14)),
    ),
  );
}

export function pageHead(title: string, line?: string, actions?: Node): HTMLElement {
  return h('header', { class: 'page-head' }, h('div', { style: 'flex:1' }, h('h1', {}, title), line ? h('p', {}, line) : null), actions);
}
