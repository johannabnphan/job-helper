// Buddy: daily missions, XP and one clear next step, built for people who find
// job hunting hard to start (e.g. ADHD). Everything is driven by real activity
// (links saved, forms filled, applications marked Applied, focus sessions).
// Tone rules: no guilt, no breakable streaks, small wins count.
import type { Job } from './types';

export type Energy = 'low' | 'medium' | 'high';
export type ActivityType = 'job_added' | 'filled' | 'applied' | 'focus_done' | 'mission_done';

export interface Activity {
  type: ActivityType;
  at: number;
  /** Job id or mission id, so the same thing never earns XP twice. */
  ref?: string;
}

export interface BuddyState {
  xp: number;
  activity: Activity[];
  /** Energy picked today ("YYYY-MM-DD" local date). */
  energy?: { date: string; level: Energy };
  focus?: { startedAt: number; endsAt: number; minutes: number };
}

export const XP: Record<ActivityType, number> = {
  job_added: 10,
  filled: 30,
  applied: 50,
  focus_done: 40,
  mission_done: 25,
};

export function emptyBuddy(): BuddyState {
  return { xp: 0, activity: [] };
}

/** Local calendar day, e.g. "2026-10-30". */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Levels: level 2 at 100 XP, then each level needs 50 XP more than the last.

export function levelInfo(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let floor = 0;
  let step = 100;
  while (xp >= floor + step) {
    floor += step;
    level++;
    step += 50;
  }
  return { level, into: xp - floor, needed: step };
}

/** Buddy grows with you. */
export function buddyFace(level: number): string {
  return ['🥚', '🐣', '🐥', '🐤', '🐦', '🦜', '🦉'][Math.min(level - 1, 6)];
}

// ---------------------------------------------------------------------------
// Seeded randomness so a day's missions and messages stay stable all day.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function seeded(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function shuffle<T>(rand: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Daily missions

interface MissionTemplate {
  id: string;
  counts: ActivityType;
  target: Record<Energy, number>;
  /** Several wordings so the day feels fresh. */
  text: Array<(n: number) => string>;
}

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

const TEMPLATES: MissionTemplate[] = [
  {
    id: 'apply',
    counts: 'applied',
    target: { low: 1, medium: 2, high: 3 },
    text: [
      (n) => `Send ${n} ${s(n, 'application', 'applications')}`,
      (n) => `Hit Submit on ${n} ${s(n, 'job', 'jobs')}`,
      (n) => `Get ${n} ${s(n, 'application', 'applications')} out the door`,
    ],
  },
  {
    id: 'fill',
    counts: 'filled',
    target: { low: 1, medium: 2, high: 4 },
    text: [
      (n) => `Autofill ${n} ${s(n, 'application', 'applications')}`,
      (n) => `Let Job Helper fill ${n} ${s(n, 'form', 'forms')} for you`,
      (n) => `Open ${n} ${s(n, 'application', 'applications')} and click Fill`,
    ],
  },
  {
    id: 'collect',
    counts: 'job_added',
    target: { low: 2, medium: 3, high: 5 },
    text: [
      (n) => `Save ${n} job links that look interesting`,
      (n) => `Find ${n} roles you'd actually enjoy`,
      (n) => `Add ${n} jobs to your list`,
    ],
  },
  {
    id: 'focus',
    counts: 'focus_done',
    target: { low: 1, medium: 1, high: 2 },
    text: [
      (n) => `Finish ${n} focus ${s(n, 'session', 'sessions')}`,
      (n) => `Do ${n} short focus ${s(n, 'sprint', 'sprints')}`,
      (n) => `Start a timer and stick with it ${s(n, 'once', `${n} times`)}`,
    ],
  },
];

export interface Mission {
  id: string;
  text: string;
  target: number;
  progress: number;
  done: boolean;
  counts: ActivityType;
}

/** Activity of one type on a given day, counting each job only once. */
export function countOn(activity: Activity[], type: ActivityType, day: string): number {
  const seen = new Set<string>();
  let n = 0;
  for (const a of activity) {
    if (a.type !== type || dayKey(a.at) !== day) continue;
    if (a.ref) {
      if (seen.has(a.ref)) continue;
      seen.add(a.ref);
    }
    n++;
  }
  return n;
}

/**
 * Three missions for the day: always one "apply" mission, plus two others
 * that change daily. Targets scale with today's energy.
 */
export function dailyMissions(day: string, energy: Energy, activity: Activity[]): Mission[] {
  const rand = seeded(`missions:${day}`);
  const apply = TEMPLATES[0];
  const others = shuffle(rand, TEMPLATES.slice(1)).slice(0, 2);
  return [apply, ...others].map((t) => {
    const target = t.target[energy];
    const progress = Math.min(target, countOn(activity, t.counts, day));
    return { id: `${day}:${t.id}`, text: pick(rand, t.text)(target), target, progress, done: progress >= target, counts: t.counts };
  });
}

// ---------------------------------------------------------------------------
// Messages

const GREETINGS: Record<Energy | 'unknown', string[]> = {
  unknown: ['Hey, you showed up. That already counts.', "Let's make today a little easier.", 'One small step at a time.'],
  low: [
    "Low-energy day? We'll keep it tiny.",
    'Gentle mode on. One thing is enough today.',
    "Rest counts too. Let's just do the smallest step.",
  ],
  medium: ["You've got this. A little progress goes a long way.", 'Steady wins. Pick one thing and go.', "Nice! Let's build some momentum."],
  high: ['Big energy! Let\'s ride it.', "You're on fire today. Let's stack some wins.", 'Great day to knock a few out.'],
};

const CHEERS = ['Nice work!', 'Look at you go!', 'That counts!', 'Another one done!', 'Proud of you!', 'Momentum!'];

export function greeting(day: string, energy?: Energy): string {
  return pick(seeded(`greet:${day}:${energy ?? 'unknown'}`), GREETINGS[energy ?? 'unknown']);
}

export function cheer(seed: number = Date.now()): string {
  return pick(seeded(`cheer:${seed}`), CHEERS);
}

/** "Showed up" days in the last 7: kinder than a streak that can break. */
export function daysActiveThisWeek(activity: Activity[], now = Date.now()): number {
  const days = new Set<string>();
  for (let i = 0; i < 7; i++) days.add(dayKey(now - i * 86400000));
  return new Set(activity.filter((a) => a.type !== 'mission_done' && days.has(dayKey(a.at))).map((a) => dayKey(a.at))).size;
}

export function encouragement(missions: Mission[]): string {
  const apply = missions.find((m) => m.counts === 'applied');
  const allDone = missions.every((m) => m.done);
  if (allDone) return "All of today's missions are done. You can stop here. Anything more is a bonus 🎉";
  if (apply && !apply.done) {
    const left = apply.target - apply.progress;
    return apply.progress ? `Just ${left} more ${left === 1 ? 'application' : 'applications'} to reach your goal!` : 'Your first application is the hardest. Let\'s do it together.';
  }
  return 'Application goal done! The rest is extra credit.';
}

// ---------------------------------------------------------------------------
// One clear next step

export type NextAction = 'profile' | 'fill' | 'mark_applied' | 'open_job' | 'add_links' | 'rest';

export interface NextStep {
  action: NextAction;
  title: string;
  detail: string;
  button: string;
  xp: number;
  job?: Job;
}

export function nextStep(ctx: {
  profileReady: boolean;
  jobs: Job[];
  /** The job open in the current tab, if it's in the list. */
  currentJob?: Job;
  allMissionsDone: boolean;
}): NextStep {
  if (!ctx.profileReady) {
    return { action: 'profile', title: 'Set up your profile once', detail: 'Upload your resume and Job Helper fills in the rest. You only do this one time.', button: 'Open profile', xp: 0 };
  }
  const cur = ctx.currentJob;
  if (cur?.status === 'to_apply') {
    return { action: 'fill', title: 'Fill this application', detail: 'Click Fill and let Job Helper do the typing. You just check the highlighted bits.', button: 'Fill this page', xp: XP.filled, job: cur };
  }
  if (cur?.status === 'filled') {
    return { action: 'mark_applied', title: 'Review and submit', detail: 'Check the amber and red fields, click the site\'s Submit button, then come back and tap Done.', button: 'I submitted it', xp: XP.applied, job: cur };
  }
  const filled = ctx.jobs.find((j) => j.status === 'filled');
  if (filled) {
    return { action: 'open_job', title: 'Finish one you started', detail: `"${filled.title || filled.company || 'This job'}" is already filled. Just review and submit.`, button: 'Open it', xp: XP.applied, job: filled };
  }
  const next = [...ctx.jobs].reverse().find((j) => j.status === 'to_apply');
  if (next) {
    return { action: 'open_job', title: 'Apply to the next job', detail: `Next up: ${next.title || next.company || 'a job from your list'}. Open it and click Fill.`, button: 'Open next job', xp: XP.filled, job: next };
  }
  if (ctx.allMissionsDone) {
    return { action: 'rest', title: 'You did it for today', detail: 'All missions done. Taking a break is part of the plan.', button: 'Add jobs for tomorrow', xp: XP.job_added };
  }
  return { action: 'add_links', title: 'Find a few jobs to apply to', detail: 'Paste links to roles that fit your experience. No need to apply yet.', button: 'Add job links', xp: XP.job_added };
}

// ---------------------------------------------------------------------------
// Recording activity (pure: returns the new state and what changed)

export interface RecordResult {
  state: BuddyState;
  gained: number;
  missionsCompleted: Mission[];
  levelUp: boolean;
}

export function applyActivity(state: BuddyState, type: Exclude<ActivityType, 'mission_done'>, ref?: string, now = Date.now()): RecordResult {
  const next: BuddyState = { ...state, activity: [...state.activity] };
  const day = dayKey(now);
  // Same job, same kind of activity: no double XP (e.g. filling a form twice).
  if (ref && next.activity.some((a) => a.type === type && a.ref === ref)) {
    return { state, gained: 0, missionsCompleted: [], levelUp: false };
  }
  const energy = next.energy?.date === day ? next.energy.level : 'medium';
  const before = dailyMissions(day, energy, next.activity);
  const beforeLevel = levelInfo(next.xp).level;

  next.activity.push({ type, at: now, ref });
  let gained = XP[type];

  const after = dailyMissions(day, energy, next.activity);
  const completed = after.filter((m, i) => m.done && !before[i].done && !next.activity.some((a) => a.type === 'mission_done' && a.ref === m.id));
  for (const m of completed) {
    next.activity.push({ type: 'mission_done', at: now, ref: m.id });
    gained += XP.mission_done;
  }
  next.xp += gained;
  // Keep storage small: 90 days of history is plenty.
  const cutoff = now - 90 * 86400000;
  next.activity = next.activity.filter((a) => a.at >= cutoff);
  return { state: next, gained, missionsCompleted: completed, levelUp: levelInfo(next.xp).level > beforeLevel };
}
