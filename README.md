# Job Helper

A Chrome extension (Manifest V3) that fills the repetitive fields of job applications
from your resume and saved answers. **It never clicks Submit.** You review the result
and submit it yourself.

All personal data stays on your machine: the profile, answer bank and job list are kept in
`chrome.storage.local`, and the resume file is kept in IndexedDB. There is no backend.

## Build

```bash
npm install
npm run build
```

The unpacked extension is written to `dist/`.

## Privacy

`.gitignore` excludes resumes and other documents, `.env` files and API keys. Never commit
personal data to this repo.
