// Focus Mode: one job, one next step, nothing else on screen.
// Steps: 1 open & autofill -> 2 review & submit (in the job's tab) -> done.
import { setStatus, unfinished, updateJob, upNext } from '../../shared/applications';
import { icon } from '../../shared/icons';
import { isSubmitted } from '../../shared/jobs';
import { getBuddy, getJobs, recordActivity, saveBuddy } from '../../shared/storage';
import type { Job } from '../../shared/types';
import { h, toast } from '../../shared/ui';
import { openAndFill, openJob } from '../actions';
import { go } from '../router';
import type { AppState } from '../state';

const DURATIONS = [5, 10, 15, 25];

/** Picks the job: the one in the URL, else the session's job, else an unfinished one, else the next saved one. */
function pickJob(s: AppState, arg: string): Job | undefined {
  const byId = (id?: string) => (id ? s.jobs.find((j) => j.id === id) : undefined);
  const fromSession = byId(s.buddy.focusJobId);
  return byId(arg) ?? (fromSession && !isSubmitted(fromSession.status) ? fromSession : undefined) ?? unfinished(s.jobs)[0] ?? upNext(s.jobs)[0];
}

export function focusMode(s: AppState, arg: string): HTMLElement {
  const job = pickJob(s, arg);
  return h(
    'div',
    { class: 'focus-wrap' },
    h(
      'div',
      { class: 'focus-top' },
      h('span', { class: 'eyebrow' }, 'Focus Mode'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'ghost', onclick: () => go('dashboard') }, icon('exit', 16), 'Exit'),
    ),
    h('main', { id: 'main', class: 'focus-body', tabindex: -1 }, job ? jobFlow(job) : emptyFlow(), timer(s)),
  );
}

function emptyFlow(): HTMLElement {
  return h(
    'div',
    { class: 'focus-card' },
    icon('compass', 36),
    h('h1', {}, 'Nothing saved to apply to yet'),
    h('p', { class: 'focus-step' }, 'First step: find one job that looks good. Just one.'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary large', href: '#jobs' }, 'Find a job'), h('a', { class: 'btn large', href: '#applications' }, 'Paste a link')),
  );
}

function jobFlow(job: Job): HTMLElement {
  const submitted = isSubmitted(job.status);
  const step = submitted ? 3 : job.status === 'in_progress' ? 2 : 1;
  const title = job.title || 'This job';
  const status = h('p', { class: 'small muted', role: 'status', 'aria-live': 'polite' });

  const fill = async (btn: HTMLButtonElement) => {
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening and filling…');
    status.textContent = 'The job opens in a new tab. ApplyBuddy fills it there.';
    const res = await openAndFill(job);
    if (res.kind === 'error') {
      status.textContent = `Something went wrong: ${res.message}. You can still open it and click Fill in the side panel.`;
      btn.disabled = false;
      btn.textContent = 'Try again';
      return;
    }
    if (res.kind === 'no-form') {
      await updateJob(job.id, (j) => (j.status = j.status === 'saved' ? 'in_progress' : j.status));
      toast("This looks like the job description. Click the site's Apply button, then Fill in the side panel.");
    }
    // fillTab already marked the job In progress; the storage listener re-renders this screen.
  };

  const bodies: Record<1 | 2 | 3, HTMLElement> = {
    1: h(
      'div',
      { class: 'stack', style: 'align-items:center' },
      h('p', { class: 'focus-step' }, "Next step: open the application. ApplyBuddy fills in what it knows."),
      h('button', { class: 'primary large', onclick: (e: Event) => fill(e.currentTarget as HTMLButtonElement) }, icon('sparkles', 18), 'Open and autofill'),
      h('button', { class: 'link small', onclick: () => openJob(job) }, 'Just open it'),
    ),
    2: h(
      'div',
      { class: 'stack', style: 'align-items:center' },
      h(
        'p',
        { class: 'focus-step' },
        job.remaining
          ? `Next step: finish the ${job.remaining} highlighted ${job.remaining === 1 ? 'field' : 'fields'}, then submit on the site.`
          : 'Next step: give it one read, then submit on the site.',
      ),
      h('p', { class: 'small muted' }, 'The side panel in that tab lists what to check. ApplyBuddy never submits for you.'),
      h(
        'div',
        { class: 'row wrap', style: 'justify-content:center' },
        h('button', { class: 'primary large', onclick: () => setStatus(job.id, 'applied') }, icon('check', 18), 'I submitted it'),
        h('button', { class: 'large', onclick: (e: Event) => fill(e.currentTarget as HTMLButtonElement) }, 'Open it again'),
      ),
      h(
        'button',
        {
          class: 'link small',
          onclick: async () => {
            toast('Saved. It will be waiting on your dashboard.');
            go('dashboard');
          },
        },
        'Save and finish later',
      ),
    ),
    3: h(
      'div',
      { class: 'stack', style: 'align-items:center' },
      h('p', { class: 'focus-step' }, 'Application sent. That is a real step forward.'),
      h(
        'div',
        { class: 'row wrap', style: 'justify-content:center' },
        h('button', { class: 'primary large', onclick: () => nextOne(job) }, 'Next job', icon('arrowRight', 18)),
        h('button', { class: 'large', onclick: () => go('dashboard') }, 'Take a break'),
      ),
    ),
  };

  return h(
    'div',
    { class: 'focus-card' },
    h(
      'div',
      { class: 'steps', role: 'img', 'aria-label': `Step ${step} of 3` },
      [1, 2, 3].map((n) => h('span', { class: n <= step ? 'on' : '' })),
    ),
    h('div', { class: 'eyebrow' }, job.company || 'Application'),
    h('h1', {}, step === 3 ? `Sent: ${title}` : title),
    bodies[step as 1 | 2 | 3],
    status,
    step < 3
      ? h(
          'button',
          {
            class: 'ghost icon',
            onclick: async () => {
              // Skip: move to the back of the line (still saved).
              await updateJob(job.id, (j) => (j.addedAt = Date.now()));
              await recordActivity('reviewed', job.id);
              await nextOne(job);
            },
          },
          icon('skip', 14),
          'Skip this one for now',
        )
      : null,
  );
}

async function nextOne(current: Job): Promise<void> {
  const jobs = await getJobs();
  const next = unfinished(jobs).find((j) => j.id !== current.id) ?? upNext(jobs).find((j) => j.id !== current.id);
  const b = await getBuddy();
  await saveBuddy({ ...b, focusJobId: next?.id });
  go('focus', next?.id ?? '');
}

// ---------------------------------------------------------------------------
// Optional, calm timer: minutes only, a soft ring, pause/resume, no alarms.

let tick: number | undefined;

function timer(s: AppState): HTMLElement {
  if (tick) clearInterval(tick);
  const f = s.buddy.focus;
  const wrap = h('section', { class: 'stack', style: 'align-items:center;gap:12px', 'aria-label': 'Focus timer' });
  const save = async (focus: typeof f) => saveBuddy({ ...(await getBuddy()), focus });

  if (!f) {
    wrap.append(
      h('p', { class: 'small muted' }, 'Want a timer? Totally optional.'),
      h(
        'div',
        { class: 'timer-options' },
        DURATIONS.map((m) =>
          h('button', { class: 'icon', onclick: () => { const now = Date.now(); void save({ startedAt: now, endsAt: now + m * 60000, minutes: m }); } }, icon('timer', 14), `${m} min`),
        ),
      ),
    );
    return wrap;
  }

  const total = f.minutes * 60000;
  const leftMs = () => (f.pausedLeft !== undefined ? f.pausedLeft : Math.max(0, f.endsAt - Date.now()));
  const R = 52;
  const C = 2 * Math.PI * R;
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '120');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  for (const [el, color] of [[track, '#e9efe9'], [arc, '#a6b9a6']] as const) {
    el.setAttribute('cx', '60');
    el.setAttribute('cy', '60');
    el.setAttribute('r', String(R));
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', '8');
    el.setAttribute('stroke-linecap', 'round');
    svg.append(el);
  }
  arc.setAttribute('stroke-dasharray', String(C));
  const label = h('div', { class: 't' });
  const paint = () => {
    const left = leftMs();
    arc.setAttribute('stroke-dashoffset', String(C * (left / total)));
    const mins = Math.ceil(left / 60000);
    label.textContent = f.pausedLeft !== undefined ? 'Paused' : left <= 0 ? 'Done' : mins <= 1 ? 'Under a minute' : `About ${mins} min`;
  };
  paint();
  tick = window.setInterval(async () => {
    paint();
    if (f.pausedLeft === undefined && leftMs() <= 0) {
      clearInterval(tick);
      await saveBuddy({ ...(await getBuddy()), focus: undefined });
      await recordActivity('focus_done', `focus:${f.startedAt}`);
      toast('Focus session complete. Nice work.');
    }
  }, 5000);

  wrap.append(
    h('div', { class: 'timer-ring' }, svg, label),
    h(
      'div',
      { class: 'row' },
      f.pausedLeft !== undefined
        ? h('button', { class: 'icon', onclick: () => { const now = Date.now(); void save({ ...f, endsAt: now + f.pausedLeft!, pausedLeft: undefined }); } }, icon('play', 14), 'Resume')
        : h('button', { class: 'icon', onclick: () => save({ ...f, pausedLeft: leftMs() }) }, icon('pause', 14), 'Pause'),
      h('button', { class: 'ghost icon', onclick: () => save(undefined) }, 'Stop timer'),
    ),
    h('p', { class: 'small muted' }, 'Stopping early is completely fine.'),
  );
  return wrap;
}
