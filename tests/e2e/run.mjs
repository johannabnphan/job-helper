// End-to-end check of the content script against local fixture pages that mimic
// each ATS's markup. Uses fictional data only.
//   npm run build && npm run test:e2e
// Needs a Chromium for Playwright (`npx playwright install chromium`).
import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contentJs = readFileSync(resolve(here, '../../dist/content.js'), 'utf8');
const only = process.argv[2];
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const profile = {
  firstName: 'Alex', lastName: 'Rivera', preferredName: '', pronouns: 'they/them',
  email: 'alex.rivera@example.com', phone: '(555) 123-4567',
  address: { line1: '1 Main St', line2: '', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'United States' },
  links: { linkedin: 'https://linkedin.com/in/alexrivera', portfolio: 'https://alexrivera.dev', github: 'https://github.com/arivera', other: '' },
  work: [
    { id: 'w1', company: 'Northwind Labs', title: 'Senior Product Designer', location: 'Remote', startDate: 'Jan 2021', endDate: '', current: true, description: 'Led onboarding redesign.' },
    { id: 'w2', company: 'Contoso Media', title: 'Product Designer', location: 'New York, NY', startDate: '06/2018', endDate: '12/2020', current: false, description: '' },
  ],
  education: [{ id: 'e1', school: 'Rhode Island School of Design', degree: 'BFA', field: 'Graphic Design', startDate: '2014', endDate: '2018', gpa: '' }],
  skills: ['Figma', 'Prototyping'],
  workAuth: { authorizedToWork: 'yes', requiresSponsorship: 'no', status: 'US citizen', countries: 'United States' },
  salary: { min: '140000', max: '170000', currency: 'USD', period: 'year' },
  startDate: 'Two weeks after offer',
  eeo: { gender: 'Decline to self-identify', race: 'Decline to self-identify', hispanicLatino: '', veteran: 'I am not a protected veteran', disability: '' },
  updatedAt: 0,
};
const answers = [
  { id: 'a1', question: 'How did you hear about us', keywords: ['hear about', 'how did you hear', 'source'], answer: 'LinkedIn' },
  { id: 'a2', question: 'Willing to relocate', keywords: ['relocate'], answer: 'Open to relocating for the right role.' },
  { id: 'a3', question: 'Visa sponsorship', keywords: ['sponsorship', 'visa'], answer: 'No', variants: ['Sponsorship not required', 'I do not require sponsorship'] },
  { id: 'a4', question: 'Job source', keywords: [], phrasings: ['Where did you find this job posting?'], answer: 'LinkedIn' },
];
const resume = { name: 'resume.pdf', type: 'application/pdf', base64: Buffer.from('%PDF-1.4 fake').toString('base64') };

const fixtures = readdirSync(resolve(here, 'fixtures')).filter((f) => f.endsWith('.html') && (!only || f.includes(only)));
const browser = await chromium.launch();
let failed = 0;
for (const file of fixtures) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1600 } });
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  await page.goto(`file://${resolve(here, 'fixtures', file)}`);
  await page.waitForTimeout(200);
  await page.addScriptTag({ content: contentJs });
  const report = await page.evaluate((p) => window.__jobHelper.fill(p), { profile, answers, resume });
  const expected = await page.evaluate(() => window.__expect?.() ?? null);
  const submitted = await page.evaluate(() => Boolean(window.__submitted));
  console.log(`\n${file}  (adapter: ${report.adapter})`);
  for (const f of report.fields) console.log(`  ${f.status.padEnd(7)} ${f.label.padEnd(60)} ${f.value ?? ''}  [${f.detail}]`);
  if (submitted) { failed++; console.log('  FAIL: form was submitted'); }
  if (expected) {
    for (const [what, ok] of Object.entries(expected)) {
      if (!ok) { failed++; console.log(`  FAIL: ${what}`); }
    }
    console.log(`  checks: ${Object.values(expected).filter(Boolean).length}/${Object.keys(expected).length} passed`);
  }
  if (shots) await page.screenshot({ path: `${shots}/${file.replace('.html', '.png')}`, fullPage: true });
  await page.close();
}
await browser.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall e2e checks passed');
