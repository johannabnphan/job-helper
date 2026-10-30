// Settings: the existing profile, answer bank, AI and data screens, plus
// app preferences. Advanced pieces stay one tab away (progressive disclosure).
import { aiView } from '../../options/ai-view';
import { AnswersView } from '../../options/answers-view';
import { dataView } from '../../options/data-view';
import { ProfileView } from '../../options/profile-view';
import type { Personality } from '../../shared/prefs';
import { savePrefs } from '../../shared/storage';
import { h, toast } from '../../shared/ui';
import type { AppState } from '../state';
import { pageHead } from './parts';

const TABS = [
  ['profile', 'Profile and resume'],
  ['preferences', 'Preferences'],
  ['answers', 'Answer bank'],
  ['ai', 'AI'],
  ['data', 'Data and privacy'],
] as const;
type Tab = (typeof TABS)[number][0];

export async function settings(s: AppState, arg: string): Promise<HTMLElement> {
  const tab: Tab = (TABS.map((t) => t[0]) as string[]).includes(arg) ? (arg as Tab) : 'profile';
  let body: HTMLElement;
  if (tab === 'profile') {
    const v = new ProfileView();
    await v.init();
    body = v.el;
  } else if (tab === 'answers') {
    const v = new AnswersView();
    await v.init();
    body = v.el;
  } else if (tab === 'ai') body = await aiView();
  else if (tab === 'data') body = dataView();
  else body = preferences(s);

  return h(
    'div',
    {},
    pageHead('Settings'),
    h('nav', { class: 'tabs-inline', 'aria-label': 'Settings sections' }, TABS.map(([id, label]) => h('a', { href: `#settings/${id}`, class: id === tab ? 'active' : '', 'aria-current': id === tab ? 'page' : undefined }, label))),
    body,
  );
}

function toggle(label: string, hint: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const id = `t-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const input = h('input', { type: 'checkbox', id, checked, role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  return h('div', { class: 'switch-row' }, h('label', { class: 'label', for: id }, label, h('span', {}, hint)), input);
}

function preferences(s: AppState): HTMLElement {
  const p = s.prefs;
  const save = async (update: Parameters<typeof savePrefs>[0]) => {
    await savePrefs(update);
    toast('Saved');
  };
  const goal = h('select', { 'aria-label': 'Daily application goal' },
    h('option', { value: '', selected: p.dailyGoal === null }, 'Match my energy each day'),
    [1, 2, 3, 4, 5, 6, 8, 10].map((n) => h('option', { value: String(n), selected: p.dailyGoal === n }, `${n} a day`)),
  );
  goal.addEventListener('change', () => save({ dailyGoal: goal.value ? Number(goal.value) : null }));

  const personalities: Array<[Personality, string]> = [
    ['encouraging', 'Encouraging: warm and supportive'],
    ['straightforward', 'Straightforward: just the facts'],
    ['quiet', 'Quiet: only when needed'],
    ['playful', 'Playful: light, with the odd emoji'],
  ];

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'Daily goal'),
      h('label', { class: 'field' }, h('span', {}, 'Applications per day'), goal),
      h('p', { class: 'small muted' }, 'Quality beats volume. A smaller goal you reach feels better than a big one you skip.'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', { style: 'margin-bottom:8px' }, 'Motivation'),
      toggle('XP, levels and badges', 'Small rewards for real progress. Turn off for a plainer experience.', p.gamification, (v) => save({ gamification: v })),
      toggle('Animations', 'Gentle transitions and celebrations. Always off if your device asks for reduced motion.', p.animations, (v) => save({ animations: v })),
      toggle('Follow-up reminders', 'Show deadlines and follow-ups coming up this week on the dashboard.', p.reminders, (v) => save({ reminders: v })),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'Companion personality'),
      h(
        'fieldset',
        { style: 'border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:10px' },
        h('legend', { class: 'sr-only' }, 'Companion personality'),
        personalities.map(([value, label]) => {
          const r = h('input', { type: 'radio', name: 'companion', value, checked: p.companion === value });
          r.addEventListener('change', () => save({ companion: value }));
          return h('label', { class: 'row' }, r, label);
        }),
      ),
    ),
    h('p', { class: 'small muted' }, 'Focus timers are always optional. Pick one in Focus Mode only when you want it.'),
  );
}
