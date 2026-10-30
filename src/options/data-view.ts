// Backup, restore and wipe. The resume file is never included in exports.
import { deleteResume } from '../shared/resume-store';
import { exportAll, importAll } from '../shared/storage';
import { download, h, toast } from '../shared/ui';

export function dataView(): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await importAll(JSON.parse(await file.text()));
      toast('Imported. Reloading…');
      setTimeout(() => location.reload(), 600);
    } catch {
      toast('That file is not a ApplyBuddy backup.', 'error');
    }
  });

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'Where your data lives'),
      h(
        'p',
        { style: 'margin:0' },
        'Your profile, answer bank and job list are stored in chrome.storage.local, and your resume file in IndexedDB. ',
        'Nothing is sent to a server. ApplyBuddy only reads and writes the application page you ask it to fill.',
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'Backup'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Exports the profile, answers and job list as JSON (not the resume file). Keep the file somewhere private and never commit it to git.'),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            onclick: async () =>
              download(`job-helper-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2)),
          },
          'Export backup',
        ),
        fileInput,
        h('button', { onclick: () => fileInput.click() }, 'Import backup'),
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'Delete everything'),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              if (!confirm('Delete your profile, answers, job list and resume from this browser?')) return;
              await chrome.storage.local.clear();
              await deleteResume();
              toast('All data deleted');
              setTimeout(() => location.reload(), 600);
            },
          },
          'Delete all data',
        ),
      ),
    ),
  );
}
