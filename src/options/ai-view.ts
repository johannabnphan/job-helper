// Settings for AI-drafted answers: the user's own API key and personal notes.
import { DRAFT_MODEL, type DraftResponse } from '../shared/ai';
import { getAi, getResumeText, saveAi } from '../shared/storage';
import { h, toast } from '../shared/ui';

export async function aiView(): Promise<HTMLElement> {
  const ai = await getAi();
  const resumeText = await getResumeText();
  const key = h('input', { type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  key.value = ai.apiKey;
  const notes = h('textarea', {
    rows: 6,
    placeholder: 'e.g. I want mission-driven healthcare companies. I care about accessibility. I prefer a warm, plain tone. Mention that I can start in January.',
  });
  notes.value = ai.notes;
  const status = h('span', { class: 'muted small' });

  const save = async () => {
    await saveAi({ apiKey: key.value.trim(), notes: notes.value });
    status.textContent = 'Saved';
    toast('AI settings saved');
  };
  const test = async () => {
    status.textContent = 'Checking…';
    const res = (await chrome.runtime.sendMessage({ type: 'jh:test-key', apiKey: key.value.trim() })) as DraftResponse;
    status.textContent = res.ok ? '✓ Key works' : res.error;
  };

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, '✨ AI drafts for written questions'),
      h(
        'p',
        { style: 'margin:0' },
        'On questions like "Why do you want to work here?", a ',
        h('strong', {}, '✨ Draft with AI'),
        ' button appears. Claude reads the job page and your resume and writes a first draft that connects the two. Drafts are always highlighted for you to read and make your own before you submit.',
      ),
      h(
        'p',
        { class: 'muted small', style: 'margin:0' },
        `Uses your own Anthropic API key and the ${DRAFT_MODEL} model. A draft typically costs a few cents. Nothing is sent until you click Draft; then the question, the job page text, your resume text and your notes below go to Anthropic's API.`,
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'API key'),
      h('label', { class: 'field' }, h('span', {}, 'Anthropic API key (create one at console.anthropic.com → API keys). Stored only in this browser.'), key),
      h('div', { class: 'row' }, h('button', { onclick: test }, 'Test key'), status),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'About me (optional)'),
      h('label', { class: 'field' }, h('span', {}, 'Anything every draft should know: what you want next, what you care about, your tone. Facts here can be used in answers.'), notes),
      h(
        'p',
        { class: 'muted small', style: 'margin:0' },
        resumeText
          ? `Using your resume text (${resumeText.length.toLocaleString()} characters).`
          : 'No resume text saved yet. Upload or re-import your resume on the Profile tab so drafts can use it. Until then, drafts use your profile.',
      ),
    ),
    h('div', { class: 'savebar row' }, h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: save }, 'Save AI settings')),
  );
}
