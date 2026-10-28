import { describe, expect, it } from 'vitest';
import { addUrls, companyFromUrl, extractUrls, jobKey, titleFromTab } from '../src/shared/jobs';

describe('jobs', () => {
  it('treats posting and apply URLs as the same job', () => {
    expect(jobKey('https://jobs.lever.co/acme/123-abc/apply')).toBe(jobKey('https://jobs.lever.co/acme/123-abc?lever-source=linkedin'));
    expect(jobKey('https://jobs.ashbyhq.com/acme/uuid/application')).toBe(jobKey('https://jobs.ashbyhq.com/acme/uuid'));
    expect(jobKey('https://acme.com/careers?gh_jid=42&utm_source=x')).toBe('acme.com/careers?gh_jid=42');
  });

  it('detects the company', () => {
    expect(companyFromUrl('https://job-boards.greenhouse.io/northwind/jobs/123')).toBe('Northwind');
    expect(companyFromUrl('https://jobs.lever.co/contoso-media/abc')).toBe('Contoso Media');
    expect(companyFromUrl('https://acme.wd5.myworkdayjobs.com/en-US/External/job/x')).toBe('Acme');
    expect(companyFromUrl('https://careers.example.com/jobs/1')).toBe('Example');
  });

  it('extracts and dedupes pasted URLs', () => {
    const urls = extractUrls('https://a.com/1\nsee https://b.com/2, and https://a.com/1');
    expect(urls).toEqual(['https://a.com/1', 'https://b.com/2']);
    const first = addUrls([], urls);
    expect(first.added).toBe(2);
    expect(addUrls(first.jobs, ['https://a.com/1/']).added).toBe(0);
  });

  it('cleans tab titles', () => {
    expect(titleFromTab('Job Application for Product Designer at Northwind')).toBe('Product Designer');
    expect(titleFromTab('Senior Engineer - Lever')).toBe('Senior Engineer');
  });
});
