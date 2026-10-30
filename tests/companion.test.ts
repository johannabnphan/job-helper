import { describe, expect, it } from 'vitest';
import { badges } from '../src/shared/achievements';
import { companionLine } from '../src/shared/companion';
import { newJob } from '../src/shared/jobs';

describe('companion', () => {
  it('speaks in every personality without guilt words', () => {
    for (const p of ['encouraging', 'straightforward', 'quiet', 'playful'] as const) {
      for (const c of [{ kind: 'setup' }, { kind: 'start' }, { kind: 'goal_done' }, { kind: 'resume', left: 2, title: 'Designer' }, { kind: 'progress', left: 1 }] as const) {
        const line = companionLine(p, c);
        expect(line.length).toBeGreaterThan(3);
        expect(line).not.toMatch(/streak|lost|missed|behind|fail/i);
      }
    }
    expect(companionLine('encouraging', { kind: 'resume', left: 2, title: 'Designer' })).toContain('2 questions left');
  });
});

describe('achievements', () => {
  it('are earned from real activity only and never lost', () => {
    expect(badges([], []).every((b) => !b.earned)).toBe(true);
    const job = { ...newJob('https://x.co/1'), status: 'interview' as const };
    const earned = badges([{ type: 'applied', at: Date.now(), ref: 'a' }, { type: 'resumed', at: Date.now(), ref: 'a' }], [job]).filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(['first-app', 'comeback', 'interview']));
    expect(earned).not.toContain('five-apps');
  });
});
