// Dashboard: what to do next, at a glance. One primary action: Start Applying.
import { unfinished, upNext } from '../../shared/applications';
import { badges } from '../../shared/achievements';
import { dailyMissions, dayKey, seeded, todaysGoal, type Energy } from '../../shared/buddy';
import { companionLine, type CompanionContext } from '../../shared/companion';
import { icon } from '../../shared/icons';
import { isSubmitted } from '../../shared/jobs';
import { getBuddy, saveBuddy, savePrefs } from '../../shared/storage';
import type { Job } from '../../shared/types';
import { h } from '../../shared/ui';
import { go } from '../router';
import { firstName, type AppState } from '../state';
import { companionCard } from './companion';
import { jobMini } from './parts';

const ENERGY: Array<[Energy, 'batteryLow' | 'cloudSun' | 'zap', string, string]> = [
  ['low', 'batteryLow', 'Low', 'Tiny steps today'],
  ['medium', 'cloudSun', 'Medium', 'A steady session'],
  ['high', 'zap', 'High', 'Ready for a push'],
];

function greeting(name: string): { title: string; line: string } {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const lines = ["Let's make a little progress today.", 'A little progress goes a long way.', 'One small step at a time.', "You don't have to do it all today."];
  const line = lines[Math.floor(seeded(`g:${dayKey()}`)() * lines.length)];
  return { title: `${part}${name ? `, ${name}` : ''}`, line };
}

export function dashboard(s: AppState): HTMLElement {
  const g = greeting(firstName(s));
  const energy = s.energy;
  const goal = todaysGoal(s.buddy.activity, energy ?? 'medium', s.prefs.dailyGoal);
  const missions = dailyMissions(dayKey(), energy ?? 'medium', s.buddy.activity, s.prefs.dailyGoal);
  const current = missions.find((m) => !m.done);
  const left = unfinished(s.jobs);
  const next = left[0] ?? upNext(s.jobs)[0];
  const ready = Boolean(s.profile.firstName && s.profile.email);

  const ctx: CompanionContext = !ready
    ? { kind: 'setup' }
    : left[0]
      ? { kind: 'resume', left: left[0].remaining ?? 0, title: left[0].title || left[0].company || 'your application' }
      : goal.done >= goal.goal
        ? { kind: 'goal_done' }
        : goal.done
          ? { kind: 'progress', left: goal.goal - goal.done }
          : { kind: 'start' };

  return h(
    'div',
    {},
    h('header', { class: 'page-head' }, h('div', {}, h('h1', {}, g.title), h('p', {}, g.line))),
    h(
      'div',
      { class: 'dash' },
      h(
        'div',
        { class: 'col' },
        heroCard(s, goal, energy, current, missions.length, missions.filter((m) => m.done).length, next, ready),
        left[0] ? resumeCard(left[0]) : null,
        recommended(s),
      ),
      h(
        'div',
        { class: 'col' },
        overview(s),
        companionCard(s, companionLine(s.prefs.companion, ctx)),
        s.prefs.gamification ? achievements(s) : null,
      ),
    ),
  );
}

function heroCard(
  s: AppState,
  goal: { done: number; goal: number },
  energy: Energy | undefined,
  current: ReturnType<typeof dailyMissions>[number] | undefined,
  total: number,
  doneCount: number,
  next: Job | undefined,
  ready: boolean,
): HTMLElement {
  const pct = Math.min(100, Math.round((goal.done / goal.goal) * 100));
  const setEnergy = async (level: Energy) => {
    const b = await getBuddy();
    await saveBuddy({ ...b, energy: { date: dayKey(), level } });
  };
  const adjust = async (delta: number) => {
    const g = Math.max(1, Math.min(10, (s.prefs.dailyGoal ?? goal.goal) + delta));
    await savePrefs({ dailyGoal: g });
  };
  const encourage = goal.done >= goal.goal ? "Goal reached. Anything more is a bonus." : goal.done ? `Just ${goal.goal - goal.done} more to go!` : 'Your first one is the hardest. You can do this.';

  return h(
    'section',
    { class: 'card hero', 'aria-labelledby': 'goal-h' },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'eyebrow', id: 'goal-h' }, "Today's goal"),
      h('span', { class: 'spacer' }),
      s.prefs.gamification ? h('span', { class: 'chip reward', title: `Level ${s.level.level}` }, icon('star', 14), `${s.buddy.xp} XP`) : null,
    ),
    h(
      'div',
      { class: 'goal-line' },
      h('strong', {}, `${goal.done} of ${goal.goal} applications`),
      h('span', { class: 'muted' }, encourage),
    ),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': "Today's applications", 'aria-valuemin': 0, 'aria-valuemax': goal.goal, 'aria-valuenow': goal.done }, h('div', { style: `width:${pct}%` })),
    h(
      'div',
      { class: 'row small muted' },
      h('button', { class: 'ghost icon', onclick: () => adjust(-1), 'aria-label': 'Lower daily goal' }, '−'),
      h('span', {}, s.prefs.dailyGoal ? `Your goal: ${s.prefs.dailyGoal} a day` : 'Goal set by your energy'),
      h('button', { class: 'ghost icon', onclick: () => adjust(1), 'aria-label': 'Raise daily goal' }, '+'),
      s.prefs.dailyGoal ? h('button', { class: 'link small', onclick: () => savePrefs({ dailyGoal: null }) }, 'use energy instead') : null,
    ),
    energy
      ? null
      : h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          h('h2', {}, "How's your energy today?"),
          h(
            'div',
            { class: 'energy-pick', role: 'group', 'aria-label': 'Energy today' },
            ENERGY.map(([lvl, ic, label, sub]) => h('button', { 'aria-pressed': 'false', onclick: () => setEnergy(lvl) }, icon(ic, 22), h('span', {}, `${label} energy`), h('span', { class: 'small muted' }, sub))),
          ),
        ),
    current
      ? h(
          'div',
          { class: 'mission' },
          h('span', { class: 'tick', 'aria-hidden': 'true' }),
          h('span', { class: 'text' }, h('span', { class: 'sr-only' }, 'Current mission: '), current.text),
          h('span', { class: 'small muted' }, `${current.progress}/${current.target}`),
        )
      : h('div', { class: 'mission done' }, h('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check', 14)), h('span', {}, "All of today's missions are done.")),
    h(
      'div',
      { class: 'row small muted' },
      h('span', {}, `Mission ${Math.min(doneCount + 1, total)} of ${total}`),
      energy ? h('button', { class: 'link small', onclick: async () => { const b = await getBuddy(); await saveBuddy({ ...b, energy: undefined }); } }, `${energy} energy · change`) : null,
    ),
    h(
      'button',
      {
        class: 'primary large cta',
        onclick: () => (ready ? go('focus') : go('settings', 'profile')),
      },
      ready ? 'Start Applying' : 'Set up your profile',
      icon('arrowRight', 18),
    ),
    h(
      'p',
      { class: 'small why' },
      !ready
        ? 'Takes about 3 minutes. Upload your resume and ApplyBuddy fills in the rest.'
        : next
          ? `Up next: ${next.title || next.company || 'a saved job'}${next.company && next.title ? ` at ${next.company}` : ''}.`
          : 'No jobs saved yet. Start Applying will help you find one.',
    ),
  );
}

function resumeCard(job: Job): HTMLElement {
  const n = job.remaining ?? 0;
  return h(
    'section',
    { class: 'card resume-card stack', 'aria-labelledby': 'resume-h' },
    h('div', { class: 'row' }, icon('resume', 20), h('h2', { id: 'resume-h' }, "Welcome back! You're almost finished.")),
    h(
      'p',
      {},
      n
        ? `You have ${n} ${n === 1 ? 'question' : 'questions'} left on ${job.title || job.company || 'an application'}. Want to pick up where you left off?`
        : `${job.title || job.company || 'An application'} is filled and waiting for your review.`,
    ),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go('focus', job.id) }, 'Resume Application')),
  );
}

function recommended(s: AppState): HTMLElement {
  const saved = upNext(s.jobs).slice(0, 3);
  return h(
    'section',
    { 'aria-labelledby': 'rec-h' },
    h('div', { class: 'section-title' }, h('h2', { id: 'rec-h' }, 'Recommended for you'), h('span', { class: 'spacer' }), h('a', { href: '#jobs', class: 'small' }, 'Find more')),
    saved.length
      ? h('div', { class: 'list-plain' }, saved.map((j) => jobMini(j)))
      : h(
          'div',
          { class: 'card empty' },
          icon('compass', 28),
          h('strong', {}, 'No recommendations yet'),
          h('span', { class: 'small' }, 'Pick a few companies in Find Jobs and real openings will show up here.'),
          h('a', { class: 'btn', href: '#jobs' }, 'Find jobs'),
        ),
  );
}

function overview(s: AppState): HTMLElement {
  const applied = s.jobs.filter((j) => isSubmitted(j.status)).length;
  const interviews = s.jobs.filter((j) => j.status === 'interview').length;
  const today = dayKey();
  const soon = dayKey(Date.now() + 7 * 86400000);
  const upcoming = s.jobs
    .flatMap((j) => [
      j.deadline ? { j, date: j.deadline, what: 'Deadline' } : null,
      s.prefs.reminders && j.followUp ? { j, date: j.followUp, what: 'Follow up' } : null,
    ])
    .filter((x): x is { j: Job; date: string; what: string } => Boolean(x && x.date <= soon && x.date >= today))
    .sort((a, b) => a.date.localeCompare(b.date));
  return h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'ov-h' },
    h('h2', { id: 'ov-h' }, 'Overview'),
    h(
      'div',
      { class: 'stat-row' },
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(applied)), h('div', { class: 'l' }, 'Applied')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(interviews)), h('div', { class: 'l' }, 'Interviews')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(upcoming.length)), h('div', { class: 'l' }, 'Coming up')),
    ),
    upcoming.length
      ? h(
          'ul',
          { class: 'list-plain small' },
          upcoming.slice(0, 4).map((u) =>
            h('li', { class: 'row' }, icon(u.what === 'Deadline' ? 'flag' : 'bell', 16), h('span', { style: 'flex:1' }, `${u.what}: ${u.j.title || u.j.company}`), h('span', { class: 'deadline' }, u.date === today ? 'today' : u.date.slice(5))),
          ),
        )
      : h('p', { class: 'small muted' }, 'Nothing due this week.'),
    h('a', { href: '#applications', class: 'small' }, 'Open My Applications'),
  );
}

function achievements(s: AppState): HTMLElement {
  const all = badges(s.buddy.activity, s.jobs);
  const earned = all.filter((b) => b.earned);
  const nextUp = all.find((b) => !b.earned);
  return h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'ach-h' },
    h('div', { class: 'row' }, h('h2', { id: 'ach-h' }, 'Achievements'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `Level ${s.level.level}`)),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': `Progress to level ${s.level.level + 1}`, 'aria-valuemin': 0, 'aria-valuemax': s.level.needed, 'aria-valuenow': s.level.into }, h('div', { style: `width:${Math.round((s.level.into / s.level.needed) * 100)}%` })),
    earned.length
      ? h('div', { class: 'badges' }, earned.map((b) => h('span', { class: 'badge', title: b.detail }, icon('award', 16), b.title)))
      : h('p', { class: 'small muted' }, 'Your first badge is one small step away.'),
    nextUp ? h('p', { class: 'small muted' }, `Next: ${nextUp.title} (${nextUp.detail.toLowerCase()})`) : null,
  );
}
