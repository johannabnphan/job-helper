// Find Jobs: real openings from the job boards of companies you pick,
// reviewed one at a time (Apply / Save / Skip). Preferences stay tucked away.
import { boardKey, fetchBoard, matchListing, parseBoard, type Listing, type Match } from '../../shared/discovery';
import { icon } from '../../shared/icons';
import { addUrls, findJob } from '../../shared/jobs';
import type { JobSearchPrefs, Workplace } from '../../shared/prefs';
import { getJobs, getPrefs, recordActivity, saveJobs, savePrefs } from '../../shared/storage';
import { h, toast } from '../../shared/ui';
import { go } from '../router';
import type { AppState } from '../state';
import { pageHead } from './parts';

interface Loaded {
  listings: Array<{ l: Listing; m: Match }>;
  errors: string[];
  at: number;
}

/** In-memory for this tab; refreshed on demand (boards change slowly). */
let cache: Loaded | undefined;
let loading = false;
let index = 0;

const split = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

async function load(s: AppState): Promise<void> {
  loading = true;
  s.rerender();
  const prefs = await getPrefs();
  const errors: string[] = [];
  const all: Listing[] = [];
  await Promise.all(
    prefs.search.boards.map(async (key) => {
      const b = parseBoard(key);
      if (!b) return;
      try {
        all.push(...(await fetchBoard(b)));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }),
  );
  const listings = all
    .filter((l) => !prefs.skipped.includes(l.id))
    .map((l) => ({ l, m: matchListing(l, prefs.search, s.profile) }))
    .filter(({ m }) => m.titleMatch)
    .sort((a, b) => b.m.rank - a.m.rank);
  cache = { listings, errors, at: Date.now() };
  index = 0;
  loading = false;
  s.rerender();
}

export function findJobs(s: AppState): HTMLElement {
  const search = s.prefs.search;
  const hasBoards = search.boards.length > 0;
  if (hasBoards && !cache && !loading) void load(s);

  return h(
    'div',
    {},
    pageHead(
      'Find Jobs',
      'Real openings from companies you choose, one at a time.',
      hasBoards ? h('button', { onclick: () => load(s), disabled: loading }, icon('resume', 16), 'Refresh') : undefined,
    ),
    !hasBoards ? boardsIntro() : loading ? h('div', { class: 'card empty', role: 'status' }, h('span', { class: 'spinner' }), 'Looking at your companies’ job boards…') : browse(s),
    preferencesCard(search),
  );
}

function addBoardForm(compact = false): HTMLElement {
  const input = h('input', { placeholder: 'Paste a careers link, e.g. https://jobs.lever.co/company', 'aria-label': 'Company job board link' });
  const err = h('p', { class: 'small', style: 'color:var(--danger)', role: 'alert' });
  const add = async (e: Event) => {
    e.preventDefault();
    const b = parseBoard(input.value);
    if (!b) {
      err.textContent = 'That link isn’t a Greenhouse, Lever or Ashby job board. Try the link from the company’s careers page.';
      return;
    }
    const prefs = await getPrefs();
    if (!prefs.search.boards.includes(boardKey(b))) await savePrefs({ search: { ...prefs.search, boards: [...prefs.search.boards, boardKey(b)] } });
    cache = undefined;
    toast(`Added ${b.slug}`);
  };
  return h('form', { class: 'stack', style: 'gap:8px', onsubmit: add }, h('div', { class: 'row' }, input, h('button', { class: compact ? '' : 'primary', type: 'submit' }, icon('plus', 16), 'Add')), err);
}

function boardsIntro(): HTMLElement {
  return h(
    'section',
    { class: 'card stack', style: 'max-width:640px' },
    icon('building', 28),
    h('h2', {}, 'Which companies would you like to work for?'),
    h(
      'p',
      {},
      'Paste a link to a company’s careers page if it uses Greenhouse, Lever or Ashby (many do). Job Helper pulls their real, current openings and shows you the ones that match.',
    ),
    addBoardForm(),
    h('p', { class: 'small muted' }, 'Tip: open a job on the company’s site. If the link contains greenhouse.io, lever.co or ashbyhq.com, it will work. Other job boards are coming later.'),
  );
}

function browse(s: AppState): HTMLElement {
  const c = cache!;
  const items = c.listings;
  const errors = c.errors.length ? h('div', { class: 'banner small', role: 'alert', style: 'margin-bottom:16px' }, c.errors.join(' ')) : null;
  if (!items.length) {
    return h(
      'div',
      {},
      errors,
      h(
        'div',
        { class: 'card empty' },
        icon('search', 28),
        h('strong', {}, 'No matching openings right now'),
        h('span', { class: 'small' }, s.prefs.search.titles.length ? 'Try adding more job titles or companies below.' : 'Add a few job titles below so we can find matches.'),
      ),
    );
  }
  if (index >= items.length) {
    return h(
      'div',
      { class: 'card empty' },
      icon('check', 28),
      h('strong', {}, 'You’ve seen everything for now'),
      h('span', { class: 'small' }, 'Nice work. Check back later or add more companies.'),
      h('a', { class: 'btn primary', href: '#focus' }, 'Apply to a saved job'),
    );
  }
  const { l, m } = items[index];
  const fact = (ic: Parameters<typeof icon>[0], text: string) => h('span', { class: 'chip' }, icon(ic, 14), text);

  const save = async (andApply: boolean) => {
    let jobs = await getJobs();
    if (!findJob(jobs, l.url)) jobs = addUrls(jobs, [l.url]).jobs;
    const job = findJob(jobs, l.url)!;
    Object.assign(job, { title: l.title, company: l.company, location: l.location || undefined, salary: l.salary, employmentType: l.employmentType, source: l.board, why: m.why });
    await saveJobs(jobs);
    await recordActivity('reviewed', job.id);
    index++;
    if (andApply) go('focus', job.id);
    else {
      toast('Saved to My Applications');
      s.rerender();
    }
  };
  const skip = async () => {
    const prefs = await getPrefs();
    await savePrefs({ skipped: [...prefs.skipped, l.id].slice(-500) });
    await recordActivity('reviewed', l.id);
    index++;
    s.rerender();
  };

  return h(
    'div',
    {},
    errors,
    h('p', { class: 'small muted', style: 'text-align:center;margin-bottom:12px' }, `${index + 1} of ${items.length} matching openings`),
    h(
      'article',
      { class: 'card job-focus', 'aria-labelledby': 'job-title' },
      h('div', { class: 'company' }, l.company),
      h('h2', { id: 'job-title' }, l.title),
      h(
        'div',
        { class: 'facts' },
        fact('pin', l.location || 'Location not listed'),
        fact('wallet', l.salary || 'Salary not listed'),
        fact('briefcase', l.employmentType || 'Type not listed'),
        l.workplace ? fact('home', l.workplace[0].toUpperCase() + l.workplace.slice(1)) : null,
      ),
      m.summary ? h('p', { class: 'summary' }, m.summary) : null,
      m.requirements.length ? h('div', { class: 'stack', style: 'gap:8px' }, h('h3', {}, 'Key requirements'), h('ul', {}, m.requirements.map((r) => h('li', {}, r)))) : null,
      h(
        'div',
        { class: 'match' },
        h('div', { class: 'fit' }, h('h3', { style: 'margin-bottom:6px' }, 'Why it might fit'), m.fits.length ? h('ul', {}, m.fits.map((f) => h('li', {}, f))) : h('p', { class: 'small' }, 'From a company you follow.')),
        h('div', { class: 'gap' }, h('h3', { style: 'margin-bottom:6px' }, 'Worth checking'), m.gaps.length ? h('ul', {}, m.gaps.map((g) => h('li', {}, g))) : h('p', { class: 'small' }, 'No obvious gaps from what’s listed.')),
      ),
      h('a', { href: l.url, target: '_blank', rel: 'noopener', class: 'small' }, 'Read the full posting', icon('external', 12)),
      h(
        'div',
        { class: 'decide' },
        h('button', { onclick: skip }, icon('skip', 16), 'Skip'),
        h('button', { onclick: () => save(false) }, icon('bookmark', 16), 'Save'),
        h('button', { class: 'primary', onclick: () => save(true) }, 'Apply', icon('arrowRight', 16)),
      ),
    ),
  );
}

function preferencesCard(p: JobSearchPrefs): HTMLElement {
  const text = (label: string, value: string, hint?: string) => {
    const input = h('input', { value, placeholder: hint });
    return { input, el: h('label', { class: 'field' }, h('span', {}, label), input) };
  };
  const titles = text('Job titles', p.titles.join(', '), 'Product Designer, UX Designer');
  const location = text('Location', p.location, 'e.g. New York');
  const salary = text('Minimum salary (for your reference)', p.salaryMin, 'e.g. 120000');
  const skills = text('Skills', p.skills.join(', '), 'Figma, research');
  const industries = text('Industries', p.industries.join(', '), 'healthcare, climate');
  const level = h('select', {}, [['', 'Any'], ['entry', 'Entry'], ['mid', 'Mid'], ['senior', 'Senior'], ['lead', 'Lead']].map(([v, l]) => h('option', { value: v, selected: p.level === v }, l)));
  const work = new Set<Workplace>(p.workplace);
  const workBtns = (['remote', 'hybrid', 'onsite'] as Workplace[]).map((w) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(work.has(w)) }, w === 'onsite' ? 'On-site' : w[0].toUpperCase() + w.slice(1));
    b.addEventListener('click', () => {
      if (work.has(w)) work.delete(w);
      else work.add(w);
      b.setAttribute('aria-pressed', String(work.has(w)));
    });
    return b;
  });

  const save = async () => {
    await savePrefs({
      search: {
        ...p,
        titles: split(titles.input.value),
        location: location.input.value.trim(),
        salaryMin: salary.input.value.trim(),
        skills: split(skills.input.value),
        industries: split(industries.input.value),
        level: level.value as JobSearchPrefs['level'],
        workplace: [...work],
      },
    });
    cache = undefined;
    toast('Preferences saved');
  };

  return h(
    'details',
    { class: 'card', style: 'margin-top:24px' },
    h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Your job preferences and companies'),
    h(
      'div',
      { class: 'stack', style: 'margin-top:16px' },
      h('div', { class: 'grid' }, titles.el, location.el, salary.el, h('label', { class: 'field' }, h('span', {}, 'Experience level'), level), skills.el, industries.el),
      h('div', { class: 'field' }, h('span', { class: 'small', style: 'font-weight:550' }, 'Work setup'), h('div', { class: 'choice-row', role: 'group', 'aria-label': 'Work setup' }, workBtns)),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save preferences')),
      h('h3', {}, 'Companies you follow'),
      p.boards.length
        ? h(
            'ul',
            { class: 'list-plain' },
            p.boards.map((b) =>
              h(
                'li',
                { class: 'row' },
                icon('building', 16),
                h('span', { style: 'flex:1' }, b.replace(':', ' · ')),
                h('button', {
                  class: 'ghost icon',
                  'aria-label': `Remove ${b}`,
                  onclick: async () => {
                    const prefs = await getPrefs();
                    await savePrefs({ search: { ...prefs.search, boards: prefs.search.boards.filter((x) => x !== b) } });
                    cache = undefined;
                  },
                }, icon('x', 14)),
              ),
            ),
          )
        : h('p', { class: 'small muted' }, 'None yet.'),
      addBoardForm(true),
      h('p', { class: 'small muted' }, 'Salary is only shown when the company lists it. Industries are used when a posting mentions them.'),
    ),
  );
}
