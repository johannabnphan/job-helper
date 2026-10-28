// Stores the resume file in IndexedDB (extension origin only). Content scripts
// can't open this database; they receive the file from the side panel instead.
import type { StoredResume } from './types';

const DB_NAME = 'job-helper';
const STORE = 'files';
const RESUME_KEY = 'resume';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function saveResume(file: File): Promise<void> {
  const record: StoredResume = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    savedAt: Date.now(),
    data: file,
  };
  return tx('readwrite', (s) => s.put(record, RESUME_KEY));
}

export async function getResume(): Promise<StoredResume | undefined> {
  return (await tx<StoredResume | undefined>('readonly', (s) => s.get(RESUME_KEY))) ?? undefined;
}

export function deleteResume(): Promise<void> {
  return tx('readwrite', (s) => s.delete(RESUME_KEY));
}
