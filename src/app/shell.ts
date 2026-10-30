// App frame: minimal sidebar on desktop, bottom navigation on mobile.
import { icon, type IconName } from '../shared/icons';
import { h } from '../shared/ui';
import type { Route } from './router';

export const NAV: Array<{ route: Route; label: string; icon: IconName }> = [
  { route: 'dashboard', label: 'Dashboard', icon: 'home' },
  { route: 'jobs', label: 'Find Jobs', icon: 'compass' },
  { route: 'applications', label: 'My Applications', icon: 'list' },
  { route: 'focus', label: 'Focus Mode', icon: 'target' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];

export function logo(): HTMLElement {
  return h('div', { class: 'brand' }, h('img', { src: '../../icons/icon48.png', width: 28, height: 28, alt: '' }), h('span', {}, 'Job Helper'));
}

export function shell(active: Route, content: HTMLElement, opts: { name: string; xp?: string }): HTMLElement {
  const link = (n: (typeof NAV)[number]) =>
    h('a', { href: `#${n.route}`, class: `nav-item${n.route === active ? ' active' : ''}`, 'aria-current': n.route === active ? 'page' : undefined }, icon(n.icon, 20), h('span', {}, n.label));

  return h(
    'div',
    { class: 'layout' },
    h(
      'aside',
      { class: 'sidebar', 'aria-label': 'Main' },
      logo(),
      h('nav', { class: 'nav' }, NAV.map(link)),
      h('span', { class: 'spacer' }),
      h(
        'details',
        { class: 'profile-menu' },
        h(
          'summary',
          {},
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, (opts.name[0] ?? '·').toUpperCase()),
          h('span', { class: 'who' }, h('strong', {}, opts.name || 'You'), opts.xp ? h('span', { class: 'small muted' }, opts.xp) : null),
        ),
        h(
          'div',
          { class: 'menu' },
          h('a', { href: '#settings/profile' }, icon('user', 16), 'Profile and resume'),
          h('a', { href: '#settings/preferences' }, icon('settings', 16), 'Preferences'),
          h('a', { href: '#settings/data' }, icon('file', 16), 'Data and privacy'),
        ),
      ),
    ),
    h('main', { id: 'main', class: 'main', tabindex: -1 }, content),
    h('nav', { class: 'tabbar', 'aria-label': 'Main' }, NAV.map(link)),
  );
}
