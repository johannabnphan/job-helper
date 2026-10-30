import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../src/shared/defaults';
import { BoardError, fetchBoard, htmlToText, keyRequirements, matchListing, normalize, parseBoard } from '../src/shared/discovery';
import { defaultPrefs } from '../src/shared/prefs';

// Response shapes from each board's public API (fictional companies/jobs).
const GH = {
  jobs: [{ id: 101, title: 'Senior Product Designer', absolute_url: 'https://job-boards.greenhouse.io/northwind/jobs/101', location: { name: 'Remote - US' },
    content: '&lt;p&gt;We build maps for hikers.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;5+ years of product design experience&lt;/li&gt;&lt;li&gt;Fluent in Figma&lt;/li&gt;&lt;/ul&gt;', updated_at: '2026-10-01' }],
};
const LEVER = [{ id: 'abc', text: 'Product Designer', hostedUrl: 'https://jobs.lever.co/contoso/abc', categories: { location: 'New York, NY', commitment: 'Full-time' },
  descriptionPlain: 'Design our reader app.', lists: [{ text: 'Requirements', content: '<li>3+ years experience with design systems</li>' }],
  salaryRange: { min: 120000, max: 150000, currency: 'USD', interval: 'per-year-salary' }, workplaceType: 'hybrid' }];
const ASHBY = { jobs: [{ id: 'x1', title: 'UX Researcher', location: 'Remote', employmentType: 'FullTime', workplaceType: 'Remote', jobUrl: 'https://jobs.ashbyhq.com/fabrikam/x1',
  descriptionPlain: 'Run studies.', compensation: { compensationTierSummary: '$110K – $130K' }, isListed: true }] };

describe('boards', () => {
  it('parses board names and careers links', () => {
    expect(parseBoard('greenhouse:northwind')).toEqual({ kind: 'greenhouse', slug: 'northwind' });
    expect(parseBoard('https://boards.greenhouse.io/northwind/jobs/1')).toEqual({ kind: 'greenhouse', slug: 'northwind' });
    expect(parseBoard('jobs.lever.co/contoso')).toEqual({ kind: 'lever', slug: 'contoso' });
    expect(parseBoard('https://jobs.ashbyhq.com/fabrikam/x1/application')).toEqual({ kind: 'ashby', slug: 'fabrikam' });
    expect(parseBoard('https://example.com/careers')).toBeUndefined();
  });

  it('normalizes each API without inventing data', () => {
    const [g] = normalize({ kind: 'greenhouse', slug: 'northwind' }, GH, 'Northwind Labs');
    expect(g).toMatchObject({ company: 'Northwind Labs', title: 'Senior Product Designer', location: 'Remote - US' });
    expect(g.salary).toBeUndefined();
    expect(g.description).toContain('• 5+ years of product design experience');
    const [l] = normalize({ kind: 'lever', slug: 'contoso' }, LEVER);
    expect(l).toMatchObject({ company: 'Contoso', salary: '$120,000 – $150,000 a year', employmentType: 'Full-time', workplace: 'hybrid' });
    const [a] = normalize({ kind: 'ashby', slug: 'fabrikam' }, ASHBY);
    expect(a).toMatchObject({ salary: '$110K – $130K', workplace: 'remote', employmentType: 'Full time' });
  });

  it('reports a clear error for an unknown board', async () => {
    const fake = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchBoard({ kind: 'lever', slug: 'nope' }, fake)).rejects.toBeInstanceOf(BoardError);
  });

  it('fetches and names a Greenhouse board', async () => {
    const fake = (async (url: string) =>
      new Response(JSON.stringify(url.includes('/jobs') ? GH : { name: 'Northwind Labs' }), { status: 200 })) as unknown as typeof fetch;
    const [g] = await fetchBoard({ kind: 'greenhouse', slug: 'northwind' }, fake);
    expect(g.company).toBe('Northwind Labs');
  });
});

describe('matching', () => {
  const profile = emptyProfile();
  profile.skills = ['Figma', 'User research'];
  profile.work = [{ id: '1', company: 'A', title: 'Designer', location: '', startDate: '2022', endDate: '', current: true, description: '' }];
  const prefs = { ...defaultPrefs().search, titles: ['Product Designer'], workplace: ['remote' as const] };

  it('explains fits and gaps in words', () => {
    const [g] = normalize({ kind: 'greenhouse', slug: 'northwind' }, GH);
    const m = matchListing(g, prefs, profile, );
    expect(m.titleMatch).toBe(true);
    expect(m.fits).toContain('Mentions your skills: Figma');
    expect(m.fits).toContain('Remote');
    expect(m.gaps[0]).toMatch(/Asks for 5\+ years/);
    expect(m.requirements[0]).toContain('5+ years');
    expect(m.why).toMatch(/Matches a role/);
  });

  it('flags a title that does not match the roles you want', () => {
    const [a] = normalize({ kind: 'ashby', slug: 'fabrikam' }, ASHBY);
    expect(matchListing(a, prefs, profile).titleMatch).toBe(false);
  });

  it('cleans HTML and finds requirement lines', () => {
    expect(htmlToText('<p>Hi&amp;bye</p><br/>x')).toMatch(/^Hi&bye\n+x$/);
    expect(keyRequirements('About us\n• Bachelor\'s degree required\n• Free snacks')).toEqual(["Bachelor's degree required"]);
  });
});
