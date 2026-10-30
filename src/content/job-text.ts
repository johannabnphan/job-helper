// Pulls the job posting's text from the page for AI drafts: title, company
// and description, without the form fields themselves.
import { deepQueryAll } from './dom';

const MAX = 14000;

export function jobPageText(doc: Document = document): string {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="description"], meta[property="og:description"]')?.content ?? '';
  // Prefer a dedicated description container when the ATS has one.
  const described = deepQueryAll(doc, [
    '#content .job-post', '.job__description', '#job-description', '[data-automation-id="jobPostingDescription"]',
    '.posting-page .section-wrapper', '.ashby-job-posting-right-pane', '[class*="jobDescription" i]', '[class*="job-description" i]',
    '[itemprop="description"]', 'article', 'main',
  ].join(', '));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const el of described) {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('form, input, select, textarea, button, script, style, nav, footer, [data-job-helper]').forEach((n) => n.remove());
    const t = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    if (t.length > 200 && !seen.has(t.slice(0, 200))) {
      seen.add(t.slice(0, 200));
      parts.push(t);
    }
    if (parts.join('\n').length > MAX) break;
  }
  const body = parts.length ? parts.join('\n\n') : (doc.body.innerText || '').trim();
  return [doc.title, meta, body].filter(Boolean).join('\n\n').slice(0, MAX);
}
