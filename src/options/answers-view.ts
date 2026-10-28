// Answer bank: reusable answers matched to form questions by keyword.
import { uid } from '../shared/defaults';
import { getAnswers, saveAnswers } from '../shared/storage';
import type { Answer } from '../shared/types';
import { h, toast } from '../shared/ui';

export class AnswersView {
  private answers: Answer[] = [];
  readonly el = h('div', { class: 'stack' });
  private statusEl = h('span', { class: 'muted small' });

  async init(): Promise<void> {
    this.answers = await getAnswers();
    this.render();
  }

  private collect(): void {
    for (const card of this.el.querySelectorAll<HTMLElement>('[data-answer-id]')) {
      const a = this.answers.find((x) => x.id === card.dataset.answerId);
      if (!a) continue;
      a.question = card.querySelector<HTMLInputElement>('[name=question]')!.value.trim();
      a.keywords = card
        .querySelector<HTMLInputElement>('[name=keywords]')!
        .value.split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      a.answer = card.querySelector<HTMLTextAreaElement>('[name=answer]')!.value;
    }
  }

  private dirty = () => (this.statusEl.textContent = 'Unsaved changes');

  private card(a: Answer): HTMLElement {
    const answer = h('textarea', { name: 'answer', rows: 3, oninput: this.dirty, placeholder: 'Your answer. Leave blank to have this question flagged instead.' });
    answer.value = a.answer;
    const question = h('input', { name: 'question', oninput: this.dirty });
    question.value = a.question;
    const keywords = h('input', { name: 'keywords', oninput: this.dirty });
    keywords.value = a.keywords.join(', ');
    return h(
      'div',
      { class: 'card stack', 'data-answer-id': a.id },
      h(
        'div',
        { class: 'row' },
        h('label', { class: 'field', style: 'flex:1' }, h('span', {}, 'Question'), question),
        h(
          'button',
          {
            class: 'danger',
            style: 'align-self:flex-end',
            onclick: () => {
              this.collect();
              this.answers = this.answers.filter((x) => x.id !== a.id);
              this.dirty();
              this.render();
            },
          },
          'Delete',
        ),
      ),
      h('label', { class: 'field' }, h('span', {}, 'Keywords (comma-separated). A form question matches when its label contains one of these.'), keywords),
      h('label', { class: 'field' }, h('span', {}, 'Answer'), answer),
    );
  }

  render(): void {
    this.el.replaceChildren(
      h(
        'p',
        { class: 'muted', style: 'margin:0' },
        'Answers to common application questions. When a form question contains one of the keywords, Job Helper fills in your answer. ',
        'For dropdowns and Yes/No questions, start the answer with the option to pick (for example "No" or "LinkedIn").',
      ),
      ...this.answers.map((a) => this.card(a)),
      h(
        'div',
        { class: 'savebar row' },
        h(
          'button',
          {
            onclick: () => {
              this.collect();
              this.answers.push({ id: uid(), question: '', keywords: [], answer: '' });
              this.render();
              this.el.querySelector<HTMLInputElement>('[data-answer-id]:last-of-type [name=question]')?.focus();
            },
          },
          '+ Add answer',
        ),
        this.statusEl,
        h('span', { class: 'spacer' }),
        h(
          'button',
          {
            class: 'primary',
            onclick: async () => {
              this.collect();
              await saveAnswers(this.answers.filter((a) => a.question || a.answer || a.keywords.length));
              this.statusEl.textContent = 'Saved';
              toast('Answer bank saved');
            },
          },
          'Save answers',
        ),
      ),
    );
  }
}
