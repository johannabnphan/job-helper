# Job Helper

A Chrome extension (Manifest V3) that fills the repetitive fields of job applications
from your resume and saved answers, then highlights what you should check.
**It never clicks Submit.** You review the form and submit it yourself.

All personal data stays on your machine. Your profile, answer bank and job list are stored in
`chrome.storage.local`, and your resume file is stored in IndexedDB. There is no backend and no
network calls.

## Features

- **Profile** (options page): contact info, address, links (LinkedIn, portfolio, GitHub), work
  history, education, skills, work authorization, salary range, start date, and optional
  self-identification answers.
- **Resume upload and import**: *Import into profile* parses a PDF or text resume into
  structured data (contact info, links, jobs, education, skills) and highlights what it
  imported. You correct it once, and every application reuses it. The file itself is saved
  locally and attached to resume upload fields.
- **Answer bank**: reusable answers to common questions (sponsorship, relocation, notice
  period, how you heard about the role, …). Each answer has:
  - **keywords**: a question containing one gets the answer. Word forms count, so
    "relocate" also matches "relocating".
  - **other ways the question is asked**: matched by similar wording. Close matches fill
    normally, and loose ones fill but are flagged.
  - **other ways to say the answer**: tried against dropdown and radio options. The
    closest option is picked, and weak picks are flagged.
- **Job links** (side panel): paste job URLs, track status (To apply, Filled, Applied), and
  open each one. Duplicates are detected, the company is inferred from the URL, and the
  title is picked up when you open the page.
- **Autofill**: *Fill this page* in the side panel, or `Alt+Shift+F`. Fills text, dropdown,
  radio, checkbox, file-upload and custom combobox fields. A generic label matcher works on
  any site, with adapters for **Greenhouse, Lever, Ashby and Workday**. Forms built from web
  components (shadow DOM), such as SmartRecruiters one-click apply, work too.
  - **Fills everything itself.** It never uses a site's "autofill with resume" button. The
    resume is attached *last*, and anything the site's parser changes afterwards is corrected.
  - **Repeating sections.** When the form has "Add experience" or "Add education", Job
    Helper counts your entries, clicks Add until the form has one block per entry (waiting
    for each to appear), and fills them in order. It ticks "I currently work here" for your
    current role and leaves its end date empty. Month/year dropdowns, Workday month/year
    boxes, `month`/`date` inputs and text boxes with an `MM/YYYY`-style placeholder are all
    handled.
  - **Self-check pass.** After filling, it re-reads every field and compares it with your
    profile. Anything wrong, empty or changed by the site is set again. Anything still
    wrong is flagged. Values that were already there (from the site or browser autofill)
    are replaced with your profile's values and flagged so you can see what changed.
    Fields *you* edited on the page are never overwritten.
- **Review highlights**: green = filled, amber = filled but check it (open-ended answers,
  closest-option picks, loose answer matches, replaced values, optional unknown fields),
  red = needs you (no confident match, open-ended questions, missing profile data, fields
  the self-check couldn't fix). A card on the page counts them and has a
  *Next flagged field* button. Editing a flagged field clears its flag.

### Buddy (focus and motivation)

Job hunting is hard to start, especially with ADHD. Buddy, at the top of the side panel,
makes the next move obvious and turns real progress into small wins:

- **One clear next step.** Set up profile → fill this application → review and submit →
  finish one you started → open the next job → add links. You never have to decide what to do.
- **Energy check-in** (Low / Medium / High). Today's missions scale to match, and low is fine.
- **Three daily missions** that change every day: always one "apply" goal plus two of
  saving links, autofilling forms and focus sessions, worded differently each day.
- **XP and levels** for real activity only: +10 per link saved, +30 per form filled, +50 per
  application marked Applied, +40 per focus session, +25 per mission finished. Each job
  counts once. Buddy grows from an egg as you level up.
- **Focus sessions** of 10, 15 or 25 minutes with a countdown.
- **No guilt.** It shows "you showed up N of the last 7 days" instead of a streak that can
  break, and once the missions are done it says you can stop.

### Never submits

Every click the content script makes goes through `safeClick`
([src/content/fill.ts](src/content/fill.ts)). It refuses submit buttons, buttons that default
to submit, links, and anything labelled submit, apply, next, continue or save and continue.
This is covered by `tests/never-submit.test.ts`, and every e2e fixture checks that its form
was not submitted.

## Build

Requires Node 20+.

```bash
npm install
```

```bash
npm run build
```

The unpacked extension is written to `dist/`.

## Load it in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select this repo's **`dist`** folder (not the repo root).
5. Pin Job Helper from the puzzle-piece menu, then click its icon to open the side panel.

After you change code, run `npm run build` again and click the reload icon on the Job Helper
card in `chrome://extensions`. Reload any open application tabs too.

## Use it

1. Open the side panel and click **Profile** (or right-click the icon → Options).
   Upload your resume, click **Import into profile**, fix anything the import got wrong, and
   click **Save profile**. Fill in work authorization, salary and start date.
2. Open **Answer bank** and write your answers. For Yes/No questions and dropdowns, start
   the answer with the option to pick, e.g. "No" or "LinkedIn".
3. Paste job links into the side panel. Open one, go to its application form, and click
   **Fill this page**.
4. Work through the amber and red highlights, check everything else, and submit the form
   yourself. Set the job's status to **Applied**.

Workday splits the application into steps. Click **Fill this page** on each step, then
click Save and Continue yourself. Job Helper adds Work Experience and Education blocks
itself. If a block doesn't appear, it flags the **Add** button so you can click it and fill
again.

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Build the extension into `dist/` |
| `npm run dev` / `npm run dev:content` | Rebuild on change: pages and service worker / content script (run `npm run build` once first) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (matcher, resume parser, job list, never-submit guard) |
| `npm run test:e2e` | Fills fixture pages that mimic each ATS in headless Chromium. Needs `npm run build` and a Playwright Chromium (`npx playwright install chromium`) |

### Layout

```
public/manifest.json         MV3 manifest (copied into dist/)
src/background/              service worker: side panel, shortcut, job titles
src/sidepanel/               job list + "Fill this page"
src/options/                 profile, resume import, answer bank, backup
src/content/                 injected into the application page
  engine.ts                  expand sections → fill (resume last) → settle → self-check → highlight
  sections.ts                "Add experience/education" handling
  fields.ts                  field discovery and question-label extraction
  fill.ts                    value setters, combobox handling, safeClick
  overlay.ts                 shadow-DOM highlights and summary card
  adapters/                  greenhouse, lever, ashby, workday, generic
src/shared/                  types, storage, matcher, resume parser, job list helpers
tests/                       unit tests and e2e fixtures (fictional data only)
```

The content script is injected on demand into every frame of the active tab, so it also
works when a Greenhouse or Ashby form is embedded in an iframe on a company site. It isn't
loaded on pages you don't fill.

### Adding an adapter

Write an `Adapter` (see `src/content/adapters/types.ts`) that maps the site's field ids to
profile keys (`describe`), finds better labels (`label`), or exposes custom widgets
(`extraFields`). Register it in `adapters/index.ts` and add a fixture under
`tests/e2e/fixtures/`.

## Limitations

- The adapters were written from each ATS's known markup and tested against local fixture
  pages, not live sites. ATS markup changes over time. When something doesn't fill, the field
  is flagged so you can fill it yourself.
- Resume import is heuristic and works best with single-column PDF or text resumes. Always
  check the result.
- Location autocompletes, cover letters and open-ended questions are left to you on purpose.

## Privacy

- No backend and no analytics. Data lives in `chrome.storage.local` and IndexedDB. Use
  **Data and privacy → Delete all data** to wipe it.
- The JSON backup export never includes the resume file. Keep backups private.
- `.gitignore` excludes resumes and other documents (`*.pdf`, `*.docx`, …), backups, `.env`
  files and API keys. Never commit personal data to this repo. Test fixtures use fictional
  people only.

## Roadmap (Phase 2, not built yet)

1. A suggested-roles feed built from public ATS job boards only (Greenhouse, Lever and
   Ashby public posting APIs).
2. Claude-drafted answers for open-ended questions, using your resume plus the company's
   mission and the job page. Drafts will always be flagged for review, and the API key will
   be stored locally, never in the repo.
