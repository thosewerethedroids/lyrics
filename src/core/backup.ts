/**
 * The portable form of the whole library: one JSON object holding every page and document.
 *
 * This is the Layer-2 fallback — export on the Mac, drop the file in iCloud, import on the iPad —
 * and it must keep working even if the GitHub sync layer is never touched. The merge here is the
 * shared reconciliation rule: a record with a newer `updatedAt` wins, and because deletions are
 * soft (a `deletedAt` stamp is still a normal, newer write) a delete propagates like any edit
 * rather than looking like a record that simply failed to sync.
 */

import type { Doc, Page } from '../db/types';

export type Backup = {
  format: 'lyrics-binder';
  version: 1;
  exportedAt: string;
  pages: Page[];
  documents: Doc[];
};

export type Timestamped = { id: string; updatedAt: string };

/**
 * Given what is on this device and what arrived in a file, returns the incoming records that
 * should overwrite local — those that are new here, or carry a strictly newer `updatedAt`.
 *
 * Pure and generic so the GitHub sync layer reconciles with the exact same rule as import.
 */
export function pickWinners<T extends Timestamped>(local: T[], incoming: T[]): T[] {
  const localById = new Map(local.map((row) => [row.id, row]));
  const winners: T[] = [];
  for (const row of incoming) {
    const mine = localById.get(row.id);
    if (!mine || row.updatedAt > mine.updatedAt) winners.push(row);
  }
  return winners;
}

/** A structural check that a parsed object is actually one of our backups before trusting it. */
export function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === 'lyrics-binder' && Array.isArray(v.pages) && Array.isArray(v.documents);
}

/** The counts a merge produced, for the confirmation the user sees. */
export type MergeReport = { pages: number; documents: number };

/** Splits a backup into just the records that should be written over the local copies. */
export function planMerge(
  local: { pages: Page[]; documents: Doc[] },
  incoming: Backup,
): { pages: Page[]; documents: Doc[] } {
  return {
    pages: pickWinners(local.pages, incoming.pages),
    documents: pickWinners(local.documents, incoming.documents),
  };
}
