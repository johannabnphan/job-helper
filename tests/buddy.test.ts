import { describe, expect, it } from 'vitest';
import {
  applyActivity,
  dailyMissions,
  dayKey,
  daysActiveThisWeek,
  emptyBuddy,
  encouragement,
  greeting,
  levelInfo,
  todaysGoal,
  nextStep,
  XP,
  type BuddyState,
} from '../src/shared/buddy';
import { newJob } from '../src/shared/jobs';

const at = (iso: string) => new Date(iso).getTime();

describe('levels', () => {
  it('needs 100 XP for level 2, then 50 more each level', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(100)).toEqual({ level: 2, into: 0, needed: 150 });
    expect(levelInfo(240)).toEqual({ level: 2, into: 140, needed: 150 });
    expect(levelInfo(250).level).toBe(3);
  });
});

describe('daily missions', () => {
  it('follow the energy plans from the brief and stay stable within a day', () => {
    const low = dailyMissions('2026-10-30', 'low', []);
    expect(low.map((m) => [m.id.split(':')[1], m.target])).toEqual([['review', 1], ['small', 1]]);
    const med = dailyMissions('2026-10-30', 'medium', []);
    expect(med.map((m) => [m.id.split(':')[1], m.target])).toEqual([['review', 3], ['apply', 2]]);
    expect(dailyMissions('2026-10-30', 'high', []).map((m) => m.id.split(':')[1])).toEqual(['focus', 'apply', 'review']);
    expect(dailyMissions('2026-10-30', 'medium', [])).toEqual(med);
  });

  it('use different wording on different days', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
    const signatures = new Set(days.map((d) => dailyMissions(d, 'medium', []).map((m) => m.text).join('|')));
    expect(signatures.size).toBeGreaterThan(3);
  });

  it('let the user override the application goal', () => {
    expect(dailyMissions('2026-10-30', 'medium', [], 5)[1].target).toBe(5);
    expect(todaysGoal([], 'low', null).goal).toBe(1);
    expect(todaysGoal([], 'low', 3).goal).toBe(3);
  });

  it('count real activity from today only, once per job', () => {
    const activity = [
      { type: 'applied' as const, at: at('2026-10-30T10:00:00'), ref: 'j1' },
      { type: 'applied' as const, at: at('2026-10-30T11:00:00'), ref: 'j1' },
      { type: 'applied' as const, at: at('2026-10-29T11:00:00'), ref: 'j2' },
    ];
    expect(dailyMissions('2026-10-30', 'medium', activity)[1].progress).toBe(1);
  });
});

describe('applyActivity', () => {
  it('awards XP once per job and bonus XP when a mission completes', () => {
    const now = at('2026-10-30T09:00:00');
    let state: BuddyState = { ...emptyBuddy(), energy: { date: dayKey(now), level: 'low' } };
    const r1 = applyActivity(state, 'applied', 'job-1', now);
    expect(r1.gained).toBe(XP.applied + XP.mission_done); // low energy: an application completes the small-step mission
    expect(r1.missionsCompleted).toHaveLength(1);
    state = r1.state;
    const r2 = applyActivity(state, 'applied', 'job-1', now + 1000);
    expect(r2.gained).toBe(0);
  });

  it('reports level-ups', () => {
    const r = applyActivity({ ...emptyBuddy(), xp: 90 }, 'job_added', 'x');
    expect(r.levelUp).toBe(true);
  });
});

describe('next step', () => {
  const job = (status: 'saved' | 'in_progress' | 'applied') => ({ ...newJob('https://jobs.lever.co/acme/1'), status, title: 'Designer' });

  it('starts with the profile', () => {
    expect(nextStep({ profileReady: false, jobs: [], allMissionsDone: false }).action).toBe('profile');
  });
  it('fills the open application, then asks to mark it applied', () => {
    expect(nextStep({ profileReady: true, jobs: [], currentJob: job('saved'), allMissionsDone: false }).action).toBe('fill');
    expect(nextStep({ profileReady: true, jobs: [], currentJob: job('in_progress'), allMissionsDone: false }).action).toBe('mark_applied');
  });
  it('prefers finishing a filled application over starting a new one', () => {
    const s = nextStep({ profileReady: true, jobs: [job('saved'), job('in_progress')], allMissionsDone: false });
    expect(s.action).toBe('open_job');
    expect(s.job?.status).toBe('in_progress');
  });
  it('suggests adding links when the list is empty', () => {
    expect(nextStep({ profileReady: true, jobs: [], allMissionsDone: false }).action).toBe('add_links');
  });
});

describe('tone', () => {
  it('has a greeting for every energy level and a gentle encouragement', () => {
    for (const e of ['low', 'medium', 'high', undefined] as const) expect(greeting('2026-10-30', e)).toBeTruthy();
    expect(encouragement(dailyMissions('2026-10-30', 'medium', []))).toMatch(/first application/);
    expect(encouragement(dailyMissions('2026-10-30', 'low', []))).toMatch(/small step/);
  });
  it('counts days shown up rather than a breakable streak', () => {
    const now = at('2026-10-30T12:00:00');
    const activity = [0, 1, 3].map((d) => ({ type: 'job_added' as const, at: now - d * 86400000 }));
    expect(daysActiveThisWeek(activity, now)).toBe(3);
  });
});
