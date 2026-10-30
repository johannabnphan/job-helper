import '../shared/ui.css';
import './app.css';
import { cheer } from '../shared/buddy';
import { icon } from '../shared/icons';
import { getBuddy, getPrefs, onStorageChange } from '../shared/storage';
import { h } from '../shared/ui';
import { currentRoute, go } from './router';
import { shell } from './shell';
import { firstName, loadState } from './state';
import { applications } from './views/applications';
import { dashboard } from './views/dashboard';
import { findJobs } from './views/find-jobs';
import { focusMode } from './views/focus';
import { onboarding } from './views/onboarding';
import { settings } from './views/settings';

const root = document.getElementById('app')!;
let rendering = false;
let queued = false;
let lastRoute = '';

async function render(): Promise<void> {
  if (rendering) {
    queued = true;
    return;
  }
  rendering = true;
  try {
    const s = await loadState(() => void render());
    document.documentElement.dataset.motion = s.prefs.animations ? 'on' : 'off';
    const { route, arg } = currentRoute();
    if (!s.prefs.onboarded && route !== 'onboarding' && route !== 'settings') {
      go('onboarding');
      return;
    }
    // Settings screens hold unsaved form edits; don't redraw them on storage changes.
    const here = `${route}/${arg}`;
    if (route === 'settings' && here === lastRoute && root.childElementCount) return;

    let view: HTMLElement;
    switch (route) {
      case 'onboarding':
        view = onboarding(s);
        break;
      case 'focus':
        view = focusMode(s, arg);
        break;
      default: {
        const content =
          route === 'jobs' ? findJobs(s)
          : route === 'applications' ? applications(s)
          : route === 'settings' ? await settings(s, arg)
          : dashboard(s);
        view = shell(route, content, { name: firstName(s) || s.profile.firstName, xp: s.prefs.gamification ? `Level ${s.level.level} · ${s.buddy.xp} XP` : undefined });
      }
    }
    // Keep scroll and focus when re-rendering the same screen.
    const sameScreen = here === lastRoute;
    const y = window.scrollY;
    root.replaceChildren(view);
    if (sameScreen) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
      document.title = `${route === 'dashboard' ? 'Dashboard' : route[0].toUpperCase() + route.slice(1)} · ApplyBuddy`;
    }
    lastRoute = here;
  } finally {
    rendering = false;
    if (queued) {
      queued = false;
      void render();
    }
  }
}

/** A small, quiet "+50 XP" note when progress is made (only if gamification is on). */
let lastXp: number | undefined;
async function celebrate(): Promise<void> {
  const [{ xp }, prefs] = await Promise.all([getBuddy(), getPrefs()]);
  if (prefs.gamification && lastXp !== undefined && xp > lastXp) {
    const note = h('div', { class: 'celebrate', role: 'status' }, icon('sparkles', 16), `+${xp - lastXp} XP · ${cheer(xp)}`);
    document.body.append(note);
    setTimeout(() => note.remove(), 2600);
  }
  lastXp = xp;
}

window.addEventListener('hashchange', () => void render());
onStorageChange(['jobs', 'profile', 'buddy', 'prefs'], () => {
  void celebrate();
  void render();
});
void celebrate();
await render();
