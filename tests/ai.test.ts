import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, fitToLimit, profileAsText } from '../src/shared/ai';
import { emptyProfile } from '../src/shared/defaults';

describe('AI draft prompt', () => {
  const p = emptyProfile();
  p.firstName = 'Alex';
  p.work = [{ id: '1', company: 'Northwind', title: 'Designer', location: '', startDate: '2021', endDate: '', current: true, description: '' }];

  it('falls back to the structured profile when no resume text is saved', () => {
    expect(profileAsText(p)).toContain('Designer at Northwind (2021 – present)');
    const prompt = buildDraftPrompt({ type: 'jh:draft', question: 'Why us?', jobText: 'We build maps.', pageTitle: 'Acme', pageUrl: 'https://x' }, '', p, '');
    expect(prompt).toContain('<question>Why us?</question>');
    expect(prompt).toContain('We build maps.');
    expect(prompt).toContain('Northwind');
  });

  it('mentions the character limit and trims to it at a sentence', () => {
    const prompt = buildDraftPrompt({ type: 'jh:draft', question: 'Q', maxLength: 300, jobText: '', pageTitle: '', pageUrl: '' }, 'resume', p, 'notes here');
    expect(prompt).toContain('at most 300 characters');
    expect(prompt).toContain('<candidate_notes>');
    expect(fitToLimit('One two three. Four five six. Seven.', 20)).toBe('One two three.');
  });
});
