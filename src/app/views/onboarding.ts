// First run: five short, skippable steps. Only what's needed to start.
import { resumeToText } from '../../options/resume-text';
import { applyParsedResume, parseResumeText } from '../../shared/resume-parser';
import { saveResume } from '../../shared/resume-store';
import type { Workplace } from '../../shared/prefs';
import { getPrefs, getProfile, savePrefs, saveProfile, saveResumeText } from '../../shared/storage';
import { h } from '../../shared/ui';
import { logo } from '../shell';
import { go } from '../router';
import type { AppState } from '../state';

const STEPS = 5;
let step = 1;

const split = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function onboarding(s: AppState): HTMLElement {
  const finish = async () => {
    await savePrefs({ onboarded: true });
    step = 1;
    go('dashboard');
  };
  const next = async () => {
    if (step >= STEPS) return finish();
    step++;
    s.rerender();
  };
  const back = () => {
    step = Math.max(1, step - 1);
    s.rerender();
  };

  let body: HTMLElement;
  let save: () => Promise<void> = async () => undefined;
  const search = s.prefs.search;

  if (step === 1) {
    const titles = h('input', { value: search.titles.join(', '), placeholder: 'e.g. Product Designer, UX Researcher', 'aria-describedby': 'ob-hint' });
    body = h('div', { class: 'stack' }, h('h1', {}, 'What roles are you looking for?'), h('label', { class: 'field' }, h('span', {}, 'Job titles (comma-separated)'), titles), h('p', { class: 'small muted', id: 'ob-hint' }, 'A couple is plenty. You can change these any time.'));
    save = async () => void (await savePrefs({ search: { ...(await getPrefs()).search, titles: split(titles.value) } }));
  } else if (step === 2) {
    const loc = h('input', { value: search.location, placeholder: 'e.g. New York, or anywhere in the US' });
    const chosen = new Set<Workplace>(search.workplace);
    const opts: Workplace[] = ['remote', 'hybrid', 'onsite'];
    const btns = opts.map((w) => {
      const b = h('button', { 'aria-pressed': String(chosen.has(w)) }, w === 'onsite' ? 'On-site' : w[0].toUpperCase() + w.slice(1));
      b.addEventListener('click', () => {
        if (chosen.has(w)) chosen.delete(w);
        else chosen.add(w);
        b.setAttribute('aria-pressed', String(chosen.has(w)));
      });
      return b;
    });
    body = h('div', { class: 'stack' }, h('h1', {}, 'Where do you want to work?'), h('label', { class: 'field' }, h('span', {}, 'Location'), loc), h('div', { class: 'field' }, h('span', { class: 'small', style: 'font-weight:550' }, 'Work setup (pick any)'), h('div', { class: 'choice-row', role: 'group', 'aria-label': 'Work setup' }, btns)));
    save = async () => void (await savePrefs({ search: { ...(await getPrefs()).search, location: loc.value.trim(), workplace: [...chosen] } }));
  } else if (step === 3) {
    const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
    const input = h('input', { type: 'file', accept: '.pdf,.txt,.md,.doc,.docx', 'aria-label': 'Resume file' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      status.textContent = 'Reading your resume…';
      await saveResume(file);
      try {
        const text = await resumeToText(file, file.name);
        await saveResumeText(text);
        const { profile, changed } = applyParsedResume(await getProfile(), parseResumeText(text));
        await saveProfile(profile);
        status.textContent = changed.length ? `Got it. Filled ${changed.length} profile fields from your resume. You can check them in Settings.` : 'Saved. We couldn\'t read details from it, so you can add them in Settings.';
      } catch {
        status.textContent = 'Saved for uploads. Reading details works with PDF or text resumes.';
      }
    });
    body = h('div', { class: 'stack' }, h('h1', {}, 'Add your resume'), h('p', {}, 'Job Helper uses it to fill applications for you. It stays in this browser.'), input, status);
  } else if (step === 4) {
    const skills = h('textarea', { rows: 3, placeholder: 'e.g. Figma, user research, SQL' });
    void getProfile().then((p) => (skills.value = p.skills.join(', ')));
    body = h('div', { class: 'stack' }, h('h1', {}, 'Your key skills'), h('label', { class: 'field' }, h('span', {}, 'Skills (from your resume if we found them)'), skills), h('p', { class: 'small muted' }, 'These help match you to jobs and explain why a job fits.'));
    save = async () => {
      const p = await getProfile();
      await saveProfile({ ...p, skills: split(skills.value) });
      await savePrefs({ search: { ...(await getPrefs()).search, skills: split(skills.value) } });
    };
  } else {
    let goal: number | null = s.prefs.dailyGoal;
    const choices: Array<[number | null, string]> = [[null, 'Match my energy'], [1, '1 a day'], [2, '2 a day'], [3, '3 a day'], [5, '5 a day']];
    const btns = choices.map(([v, label]) => {
      const b = h('button', { 'aria-pressed': String(goal === v) }, label);
      b.addEventListener('click', () => {
        goal = v;
        btns.forEach((x, i) => x.setAttribute('aria-pressed', String(choices[i][0] === v)));
      });
      return b;
    });
    body = h('div', { class: 'stack' }, h('h1', {}, 'A daily goal? (optional)'), h('p', {}, 'Small and doable is the point. You can change it any time.'), h('div', { class: 'choice-row', role: 'group', 'aria-label': 'Daily goal' }, btns));
    save = async () => void (await savePrefs({ dailyGoal: goal }));
  }

  return h(
    'div',
    { class: 'onboard' },
    h(
      'main',
      { id: 'main', class: 'card', tabindex: -1 },
      h('div', { class: 'row' }, logo(), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `Step ${step} of ${STEPS}`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Setup progress', 'aria-valuemin': 0, 'aria-valuemax': STEPS, 'aria-valuenow': step }, h('div', { style: `width:${(step / STEPS) * 100}%` })),
      body,
      h(
        'div',
        { class: 'actions' },
        step > 1 ? h('button', { class: 'ghost', onclick: back }, 'Back') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'ghost', onclick: next }, 'Skip'),
        h('button', { class: 'primary', onclick: async () => { await save(); await next(); } }, step === STEPS ? 'Start using Job Helper' : 'Continue'),
      ),
      step === 1 ? h('button', { class: 'link small', style: 'align-self:center', onclick: finish }, 'Skip setup for now') : null,
    ),
  );
}
