// AI-drafted answers for open-ended questions ("Why do you want to work here?").
// Drafts use the candidate's resume/profile plus the job page, and are always
// flagged for review. Nothing is sent anywhere unless the user clicks Draft.
import type { Profile } from './types';

export interface AiSettings {
  /** The user's own Anthropic API key. Stored only in chrome.storage.local. */
  apiKey: string;
  /** Extra context the user wants every draft to know (goals, motivations, tone). */
  notes: string;
}

export function emptyAi(): AiSettings {
  return { apiKey: '', notes: '' };
}

export const DRAFT_MODEL = 'claude-opus-5-5';

/** Message from a content script asking the service worker for a draft. */
export interface DraftRequest {
  type: 'jh:draft';
  question: string;
  /** maxlength of the field, if it has one. */
  maxLength?: number;
  jobText: string;
  pageTitle: string;
  pageUrl: string;
}

export type DraftResponse = { ok: true; text: string } | { ok: false; error: string };

export const SYSTEM_PROMPT = `You help a job seeker answer written questions on job applications. Many of the people using this tool have ADHD and find these questions hard to start, so your draft is a strong first version they will read, adjust and own.

Write the answer in the first person, as the candidate.

Ground every claim in the candidate's resume, profile and notes. Never invent employers, job titles, degrees, numbers, projects or personal stories. If a good answer needs something the materials don't contain, write around it and leave a short placeholder in square brackets for the candidate to fill in, for example [a moment you used the product].

Connect the candidate's real experience to what this particular company and role need: its mission, product, customers and the responsibilities in the posting. Pick one or two specific, relevant points rather than listing everything. A reader should be able to tell the answer was written for this company.

Sound like a thoughtful person writing plainly: concrete, warm, confident without overclaiming. Avoid stock phrases such as "I am excited to apply", "passionate", "dynamic", "synergy" or "fast-paced environment". Use short paragraphs and no headings, bullet points or sign-off unless the question asks for them.

Keep it to roughly 120 to 180 words unless the question implies a different length. When a character limit is given, stay safely under it.

Reply with the answer text only, with no preamble or explanation.`;

function line(label: string, value: string | undefined): string {
  return value && value.trim() ? `${label}: ${value.trim()}\n` : '';
}

/** Plain-text summary of the structured profile, used when no resume text is saved. */
export function profileAsText(p: Profile): string {
  let out = '';
  out += line('Name', [p.firstName, p.lastName].filter(Boolean).join(' '));
  out += line('Location', [p.address.city, p.address.state, p.address.country].filter(Boolean).join(', '));
  out += line('LinkedIn', p.links.linkedin);
  out += line('Portfolio', p.links.portfolio);
  if (p.work.length) {
    out += '\nExperience:\n';
    for (const w of p.work) {
      out += `- ${[w.title, w.company].filter(Boolean).join(' at ')} (${w.startDate || '?'} – ${w.current ? 'present' : w.endDate || '?'})${w.location ? `, ${w.location}` : ''}\n`;
      if (w.description) out += `${w.description.replace(/^/gm, '  ')}\n`;
    }
  }
  if (p.education.length) {
    out += '\nEducation:\n';
    for (const e of p.education) out += `- ${[e.degree, e.field].filter(Boolean).join(' in ')}${e.school ? `, ${e.school}` : ''}${e.endDate ? ` (${e.endDate})` : ''}\n`;
  }
  if (p.skills.length) out += `\nSkills: ${p.skills.join(', ')}\n`;
  return out.trim();
}

export function buildDraftPrompt(req: DraftRequest, resumeText: string, profile: Profile, notes: string): string {
  const limit = req.maxLength && req.maxLength > 0 ? `\nThe answer box allows at most ${req.maxLength} characters.` : '';
  return `<job_posting source="${req.pageUrl}" title="${req.pageTitle.replace(/"/g, "'")}">
${req.jobText.trim() || '(No job description was found on the page. Write from the question and the company name in the title.)'}
</job_posting>

<candidate_resume>
${resumeText.trim() || profileAsText(profile)}
</candidate_resume>
${notes.trim() ? `\n<candidate_notes>\n${notes.trim()}\n</candidate_notes>\n` : ''}
<question>${req.question.trim()}</question>${limit}

Write the candidate's answer to the question.`;
}

/** Trims a draft to fit a character limit, at a sentence boundary when possible. */
export function fitToLimit(text: string, maxLength?: number): string {
  const t = text.trim();
  if (!maxLength || t.length <= maxLength) return t;
  const cut = t.slice(0, maxLength);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > maxLength * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}
