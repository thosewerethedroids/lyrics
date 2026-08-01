/**
 * Reading and writing the whole library as a single JSON file.
 *
 * Export includes soft-deleted records on purpose: a `deletedAt` row is how a deletion travels to
 * another device, so dropping them would resurrect deleted songs on the next import.
 */

import { db } from './db';
import type { Doc, Page } from './types';
import { isBackup, planMerge } from '../core/backup';
import type { Backup, MergeReport } from '../core/backup';
import { nowIso } from '../core/ids';

export async function buildBackup(): Promise<Backup> {
  const [pages, documents] = await Promise.all([db.pages.toArray(), db.documents.toArray()]);
  return { format: 'lyrics-binder', version: 1, exportedAt: nowIso(), pages, documents };
}

/** A filename that sorts by date and never collides across a day's worth of exports. */
export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `lyrics-binder-${stamp}.json`;
}

/** Serialises the whole library and triggers a browser download. */
export async function exportToFile(): Promise<void> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export class BackupError extends Error {}

/**
 * Merges a backup file into the local store.
 *
 * Newer records win by `updatedAt`; nothing local is dropped just because it is absent from the
 * file. Returns how many pages and documents were actually overwritten, so the toast can say so.
 */
export async function importFromFile(text: string): Promise<MergeReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }
  if (!isBackup(parsed)) {
    throw new BackupError('That file is not a lyrics binder backup.');
  }

  const [pages, documents] = await Promise.all([db.pages.toArray(), db.documents.toArray()]);
  const winners = planMerge({ pages, documents }, parsed);

  await db.transaction('rw', db.pages, db.documents, async () => {
    if (winners.pages.length) await db.pages.bulkPut(winners.pages as Page[]);
    if (winners.documents.length) await db.documents.bulkPut(winners.documents as Doc[]);
  });

  return { pages: winners.pages.length, documents: winners.documents.length };
}
