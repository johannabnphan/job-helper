// Badges earned from real activity only. Nothing is lost for missed days.
import { dayKey, type Activity } from './buddy';
import type { Job } from './types';

export interface Badge {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

export function badges(activity: Activity[], jobs: Job[]): Badge[] {
  const count = (t: Activity['type']) => new Set(activity.filter((a) => a.type === t).map((a) => a.ref ?? a.at)).size;
  const applied = count('applied');
  const days = new Set(activity.filter((a) => a.type !== 'mission_done').map((a) => dayKey(a.at))).size;
  const b = (id: string, title: string, detail: string, earned: boolean): Badge => ({ id, title, detail, earned });
  return [
    b('first-step', 'First step', 'Saved or reviewed your first job', count('job_added') + count('reviewed') > 0),
    b('first-app', 'Out the door', 'Sent your first application', applied >= 1),
    b('five-apps', 'Momentum', 'Sent 5 applications', applied >= 5),
    b('ten-apps', 'Steady hands', 'Sent 10 applications', applied >= 10),
    b('focus', 'In the zone', 'Finished a focus session', count('focus_done') >= 1),
    b('comeback', 'Comeback', 'Finished an application you had paused', count('resumed') >= 1),
    b('three-days', 'Showing up', 'Made progress on 3 different days (any days count)', days >= 3),
    b('interview', 'Conversation started', 'Reached an interview', jobs.some((j) => j.status === 'interview' || j.status === 'offer')),
  ];
}
