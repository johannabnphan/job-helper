// The Buddy card at the top of the side panel: level, today's missions,
// energy check-in, one clear next step, and a focus timer.
import {
  buddyFace,
  dailyMissions,
  dayKey,
  daysActiveThisWeek,
  encouragement,
  greeting,
  levelInfo,
  nextStep,
  type Energy,
  type NextStep,
} from '../shared/buddy';
import { findJob } from '../shared/jobs';
import { getBuddy, getJobs, getProfile, recordActivity, saveBuddy } from '../shared/storage';
import { h } from '../shared/ui';

export interface BuddyActions {
  openProfile(): void;
  fillPage(): void;
  openJob(url: string): void;
  focusAddLinks(): void;
  markApplied(jobId: string): Promise<void>;
}

const ENERGY: Array<[Energy, string, string]> = [
  ['low', '🪫', 'Low'],
  ['medium', '🌤️', 'Medium'],
  ['high', '⚡', 'High'],
];

let timer: number | undefined;

function mmss(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Ends a finished focus session (also catches ones that ended while the panel was closed). */
export async function settleFocus(): Promise<void> {
  const state = await getBuddy();
  if (state.focus && Date.now() >= state.focus.endsAt) {
    const ref = `focus:${state.focus.startedAt}`;
    await saveBuddy({ ...state, focus: undefined });
    await recordActivity('focus_done', ref);
  }
}

export async function buddyCard(tabUrl: string | undefined, actions: BuddyActions): Promise<HTMLElement> {
  await settleFocus();
  const [state, jobs, profile] = await Promise.all([getBuddy(), getJobs(), getProfile()]);
  const day = dayKey();
  const energy = state.energy?.date === day ? state.energy.level : undefined;
  const missions = dailyMissions(day, energy ?? 'medium', state.activity);
  const { level, into, needed } = levelInfo(state.xp);
  const currentJob = tabUrl ? findJob(jobs, tabUrl) : undefined;
  const step = nextStep({ profileReady: Boolean(profile.firstName && profile.email), jobs, currentJob, allMissionsDone: missions.every((m) => m.done) });
  const week = daysActiveThisWeek(state.activity);

  const setEnergy = async (level: Energy) => {
    const s = await getBuddy();
    await saveBuddy({ ...s, energy: { date: day, level } });
  };

  const energyPicker = energy
    ? h(
        'div',
        { class: 'row small muted' },
        `Energy today: ${ENERGY.find((e) => e[0] === energy)![1]} ${ENERGY.find((e) => e[0] === energy)![2]}`,
        h('button', { class: 'link small', onclick: async () => { const s = await getBuddy(); await saveBuddy({ ...s, energy: undefined }); } }, 'change'),
      )
    : h(
        'div',
        { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'small', style: 'font-weight:600' }, "How's your energy today?"),
        h(
          'div',
          { class: 'energy' },
          ENERGY.map(([lvl, icon, label]) => h('button', { onclick: () => setEnergy(lvl), 'aria-label': `${label} energy` }, h('span', { class: 'energy-icon' }, icon), label)),
        ),
        h('div', { class: 'muted small' }, 'Your missions adjust to match. Low is totally fine.'),
      );

  return h(
    'section',
    { class: 'card stack buddy' },
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'buddy-face', 'aria-hidden': 'true' }, buddyFace(level)),
      h(
        'div',
        { style: 'flex:1;min-width:0' },
        h('div', { class: 'row' }, h('h2', {}, 'Buddy'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `Level ${level} · ${state.xp} XP`)),
        h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': needed, 'aria-valuenow': into, title: `${needed - into} XP to level ${level + 1}` }, h('div', { style: `width:${Math.round((into / needed) * 100)}%` })),
      ),
    ),
    h('p', { class: 'buddy-say' }, greeting(day, energy)),
    energyPicker,
    missionsView(missions),
    h('p', { class: 'small', style: 'margin:0;font-weight:600' }, encouragement(missions)),
    nextStepView(step, actions),
    focusView(state.focus),
    week ? h('div', { class: 'muted small' }, `You showed up ${week} of the last 7 days 💛`) : null,
  );
}

function missionsView(missions: ReturnType<typeof dailyMissions>): HTMLElement {
  return h(
    'div',
    { class: 'stack', style: 'gap:6px' },
    h('div', { class: 'small', style: 'font-weight:600' }, "Today's missions"),
    h(
      'ul',
      { class: 'missions' },
      missions.map((m) =>
        h(
          'li',
          { class: m.done ? 'done' : '' },
          h('span', { class: 'check', 'aria-hidden': 'true' }, m.done ? '✓' : ''),
          h('span', { class: 'mtext' }, m.text),
          h('span', { class: 'small muted' }, `${m.progress}/${m.target}`),
        ),
      ),
    ),
  );
}

function nextStepView(step: NextStep, actions: BuddyActions): HTMLElement {
  const run = async () => {
    switch (step.action) {
      case 'profile':
        return actions.openProfile();
      case 'fill':
        return actions.fillPage();
      case 'mark_applied':
        return step.job && actions.markApplied(step.job.id);
      case 'open_job':
        return step.job && actions.openJob(step.job.url);
      case 'add_links':
      case 'rest':
        return actions.focusAddLinks();
    }
  };
  return h(
    'div',
    { class: 'nextstep stack', style: 'gap:6px' },
    h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Your next step'), h('span', { class: 'spacer' }), step.xp ? h('span', { class: 'xp' }, `+${step.xp} XP`) : null),
    h('strong', {}, step.title),
    h('div', { class: 'small muted' }, step.detail),
    h('button', { class: 'primary', onclick: run }, step.button),
  );
}

function focusView(focus: { endsAt: number; minutes: number } | undefined): HTMLElement {
  if (timer) clearInterval(timer);
  const start = async (minutes: number) => {
    const s = await getBuddy();
    const now = Date.now();
    await saveBuddy({ ...s, focus: { startedAt: now, endsAt: now + minutes * 60000, minutes } });
  };
  if (!focus) {
    return h(
      'div',
      { class: 'row wrap small', style: 'gap:6px' },
      h('span', { class: 'muted' }, 'Focus session:'),
      [10, 15, 25].map((m) => h('button', { class: 'icon', onclick: () => start(m) }, `${m} min`)),
    );
  }
  const clock = h('strong', { class: 'clock' }, mmss(focus.endsAt - Date.now()));
  timer = window.setInterval(async () => {
    const left = focus.endsAt - Date.now();
    clock.textContent = mmss(left);
    if (left <= 0) {
      clearInterval(timer);
      await settleFocus();
    }
  }, 1000);
  return h(
    'div',
    { class: 'focus row' },
    h('span', {}, '🎯 Focusing'),
    clock,
    h('span', { class: 'spacer' }),
    h('button', { class: 'icon', onclick: async () => { const s = await getBuddy(); await saveBuddy({ ...s, focus: undefined }); } }, 'Stop'),
  );
}
