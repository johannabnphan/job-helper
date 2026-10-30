// Collapsible companion card: one scripted line for right now, quick help,
// and an optional AI chat that only runs when an API key is configured.
import type { DraftResponse } from '../../shared/ai';
import { UNSTICK_STEPS, type AskRequest } from '../../shared/companion';
import { icon } from '../../shared/icons';
import { getAi, savePrefs } from '../../shared/storage';
import { h } from '../../shared/ui';
import type { AppState } from '../state';

const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

export function companionCard(s: AppState, line: string): HTMLElement {
  const msgs = h('div', { class: 'msgs', 'aria-live': 'polite' }, h('div', { class: 'bubble' }, line));
  for (const m of history) msgs.append(h('div', { class: m.role === 'user' ? 'me' : 'bubble' }, m.text));
  const input = h('input', { placeholder: 'Ask anything about your job search…', 'aria-label': 'Ask the companion' });
  const boundary = h('p', { class: 'boundary' }, 'Checking AI connection…');
  const sendBtn = h('button', { class: 'primary icon', type: 'submit', 'aria-label': 'Send' }, icon('send', 16));

  void getAi().then((ai) => {
    boundary.textContent = ai.apiKey
      ? 'AI chat on (uses your Anthropic API key).'
      : 'AI chat is off. Add an API key in Settings → AI to ask questions. The tips above are built in.';
    input.disabled = sendBtn.disabled = !ai.apiKey;
  });

  const ask = async (e: Event) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    msgs.append(h('div', { class: 'me' }, q));
    const thinking = h('div', { class: 'bubble row' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Thinking…');
    msgs.append(thinking);
    msgs.scrollTop = msgs.scrollHeight;
    const req: AskRequest = {
      type: 'jh:ask',
      question: q,
      personality: s.prefs.companion,
      history: [...history],
      context: `Applications in progress: ${s.jobs.filter((j) => j.status === 'in_progress').map((j) => j.title || j.company).join(', ') || 'none'}. Saved: ${s.jobs.filter((j) => j.status === 'saved').length}. Energy today: ${s.energy ?? 'not set'}.`,
    };
    const res = (await chrome.runtime.sendMessage(req)) as DraftResponse;
    thinking.remove();
    const text = res.ok ? res.text : res.error;
    msgs.append(h('div', { class: 'bubble' }, text));
    if (res.ok) history.push({ role: 'user', text: q }, { role: 'assistant', text });
    msgs.scrollTop = msgs.scrollHeight;
  };

  const details = h(
    'details',
    { class: 'card companion', open: s.prefs.companionOpen && s.prefs.companion !== 'quiet' },
    h('summary', {}, icon('chat', 18), h('h2', { style: 'flex:1' }, 'Your companion'), icon('chevronDown', 16)),
    h(
      'div',
      { class: 'stack', style: 'margin-top:12px;gap:12px' },
      msgs,
      h(
        'div',
        { class: 'row wrap' },
        h('button', {
          class: 'icon',
          onclick: () => {
            msgs.append(h('div', { class: 'bubble' }, h('strong', {}, "Let's make it tiny:"), h('ol', { style: 'margin:6px 0 0;padding-left:18px' }, UNSTICK_STEPS.map((t) => h('li', {}, t)))));
          },
        }, "I'm stuck"),
        h('button', { class: 'icon', onclick: () => msgs.append(h('div', { class: 'bubble' }, 'Taking a break is part of the plan. Your progress is saved. Come back whenever you like.')) }, 'I need a break'),
      ),
      h('form', { class: 'row', onsubmit: ask }, input, sendBtn),
      boundary,
    ),
  );
  details.addEventListener('toggle', () => void savePrefs({ companionOpen: details.open }));
  return details;
}
