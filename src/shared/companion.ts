// The job-search companion: short, context-aware guidance in the user's
// chosen personality. These lines are scripted (not AI); free-form chat goes
// to Claude only when the user has added an API key.
import type { Personality } from './prefs';

export type CompanionContext =
  | { kind: 'setup' }
  | { kind: 'resume'; left: number; title: string }
  | { kind: 'goal_done' }
  | { kind: 'start' }
  | { kind: 'progress'; left: number };

const LINES: Record<Personality, (c: CompanionContext) => string> = {
  encouraging: (c) => {
    switch (c.kind) {
      case 'setup': return "Let's get your profile ready. It's a one-time thing, then I'll handle the typing.";
      case 'resume': return c.left ? `You're almost done with ${c.title}. Just ${c.left} ${c.left === 1 ? 'question' : 'questions'} left.` : `Want to finish ${c.title}? You already did the hard part.`;
      case 'goal_done': return 'You made progress today. Nice work! Anything more is a bonus.';
      case 'start': return 'Ready to knock out one application? Just one is a great start.';
      case 'progress': return `Nice going. ${c.left} more to hit today's goal, or take a break. Both are fine.`;
    }
  },
  straightforward: (c) => {
    switch (c.kind) {
      case 'setup': return 'Set up your profile first. Autofill needs it.';
      case 'resume': return c.left ? `${c.title}: ${c.left} fields left. Resume it.` : `${c.title} is in progress. Resume it.`;
      case 'goal_done': return "Daily goal met. You can stop here.";
      case 'start': return 'Next step: open one application.';
      case 'progress': return `${c.left} left for today's goal.`;
    }
  },
  quiet: (c) => {
    switch (c.kind) {
      case 'setup': return 'Profile first.';
      case 'resume': return `Pick up ${c.title}?`;
      case 'goal_done': return 'Goal met.';
      case 'start': return 'One application?';
      case 'progress': return `${c.left} to go.`;
    }
  },
  playful: (c) => {
    switch (c.kind) {
      case 'setup': return "Hand me your resume and I'll do the boring typing. Deal? 🤝";
      case 'resume': return c.left ? `${c.title} is ${c.left} ${c.left === 1 ? 'question' : 'questions'} from the finish line 🏁` : `${c.title} misses you. Finish it? 👀`;
      case 'goal_done': return "Goal smashed! Go stretch, grab a snack, you earned it 🍪";
      case 'start': return "Let's knock one out. I'll fill, you shine ✨";
      case 'progress': return `${c.left} more and today's a wrap 🎬`;
    }
  },
};

export function companionLine(p: Personality, c: CompanionContext): string {
  return LINES[p](c);
}

/** Small, concrete steps for when someone is stuck (scripted, no AI). */
export const UNSTICK_STEPS = [
  'Open the job you saved first. Just open it; nothing else.',
  'Click Fill this page and let Job Helper do the typing.',
  'Fix the red fields one at a time. The pill shows how many are left.',
  "Read the amber ones once. They're usually fine.",
  "Submit, then tap I submitted it. That's a whole application.",
];

export interface AskRequest {
  type: 'jh:ask';
  question: string;
  personality: Personality;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** What the user is working on, so answers are specific. */
  context: string;
}

export function companionSystemPrompt(p: Personality): string {
  const tone = {
    encouraging: 'warm and encouraging, celebrating small wins without being gushy',
    straightforward: 'direct and practical, no fluff',
    quiet: 'very brief: one or two short sentences',
    playful: 'light and playful, an occasional emoji, never silly about serious topics',
  }[p];
  return `You are the job-search companion inside Job Helper, a tool that helps people, many with ADHD, apply to jobs without getting overwhelmed. Your tone is ${tone}.

Help with: choosing the next task, understanding job descriptions, explaining application questions, resume suggestions, getting unstuck, and breaking big tasks into tiny steps.

Keep answers short and skimmable: lead with the single next action. Offer at most three steps at a time. Never guilt or pressure; rest is a valid choice. Never invent facts about the user's experience; if you need a detail, ask for it. You cannot click or submit anything yourself. Job Helper fills forms and the user always submits.`;
}
