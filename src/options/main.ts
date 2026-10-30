import '../shared/ui.css';
import './options.css';
import { h } from '../shared/ui';
import { aiView } from './ai-view';
import { AnswersView } from './answers-view';
import { dataView } from './data-view';
import { ProfileView } from './profile-view';

const TABS = [
  ['profile', 'Profile'],
  ['answers', 'Answer bank'],
  ['ai', 'AI drafts'],
  ['data', 'Data and privacy'],
] as const;
type Tab = (typeof TABS)[number][0];

const profile = new ProfileView();
const answers = new AnswersView();
const panes: Record<Tab, HTMLElement> = { profile: profile.el, answers: answers.el, ai: await aiView(), data: dataView() };

const nav = h(
  'nav',
  { class: 'tabs' },
  TABS.map(([id, label]) => h('a', { href: `#${id}`, 'data-tab': id }, label)),
);
const content = h('div', { class: 'content' });

document.getElementById('app')!.append(
  h('header', { class: 'top' }, h('div', { class: 'row' }, h('img', { src: '../../icons/icon32.png', width: 24, height: 24, alt: '' }), h('h1', {}, 'ApplyBuddy')), nav),
  content,
);

function show(): void {
  const tab = (location.hash.slice(1) as Tab) in panes ? (location.hash.slice(1) as Tab) : 'profile';
  for (const a of nav.querySelectorAll<HTMLElement>('a')) a.classList.toggle('active', a.dataset.tab === tab);
  content.replaceChildren(panes[tab]);
}

window.addEventListener('hashchange', show);
await Promise.all([profile.init(), answers.init()]);
show();
