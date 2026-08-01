import { db } from './db';
import type { Doc } from './types';
import { isLive } from './types';
import { nowIso, uuid } from '../core/ids';
import { getDeviceId } from './settings';

/**
 * Documents hold *references* to pages, never copies, so fixing a typo fixes it in every setlist
 * the song appears in.
 *
 * `pageIds` may contain the same id twice — a reprise is a real thing a setlist does. Anything
 * that indexes this array must therefore key on position, not on page id.
 */

async function write(doc: Doc): Promise<Doc> {
  const next: Doc = { ...doc, updatedAt: nowIso(), deviceId: await getDeviceId() };
  await db.documents.put(next);
  return next;
}

export async function createDoc(name: string, pageIds: string[] = []): Promise<Doc> {
  const now = nowIso();
  return write({
    id: uuid(),
    name: name.trim() || 'Untitled',
    pageIds,
    createdAt: now,
    updatedAt: now,
    deviceId: '',
  });
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return db.documents.get(id);
}

export async function allLiveDocs(): Promise<Doc[]> {
  return (await db.documents.toArray()).filter(isLive);
}

export async function renameDoc(id: string, name: string): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) return;
  await write({ ...doc, name: name.trim() || 'Untitled' });
}

/** Soft delete. The pages themselves are untouched — they belong to the library, not the document. */
export async function deleteDoc(id: string): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) return;
  await write({ ...doc, deletedAt: nowIso() });
}

export async function restoreDoc(id: string): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) return;
  const { deletedAt: _dropped, ...rest } = doc;
  await write(rest as Doc);
}

/**
 * Replaces the running order wholesale. This is what a drag-and-drop reorder calls.
 *
 * Reorder saves immediately rather than on some "done" action, because on stage the app can be
 * backgrounded at any moment and an unsaved arrangement is worse than no arrangement.
 */
export async function setPageOrder(id: string, pageIds: string[]): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) return;
  await write({ ...doc, pageIds });
}

export async function appendPages(id: string, pageIds: string[]): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc || pageIds.length === 0) return;
  await write({ ...doc, pageIds: [...doc.pageIds, ...pageIds] });
}

/** Removes one slot, by position — not by page id, so a reprise loses only the verse you meant. */
export async function removeSlot(id: string, index: number): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc || index < 0 || index >= doc.pageIds.length) return;
  const pageIds = [...doc.pageIds];
  pageIds.splice(index, 1);
  await write({ ...doc, pageIds });
}

/** Moves the page at `from` to `to`, closing the gap behind it. */
export async function moveSlot(id: string, from: number, to: number): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) return;
  const pageIds = moveWithin(doc.pageIds, from, to);
  if (!pageIds) return;
  await write({ ...doc, pageIds });
}

/** Pure array move, shared with the drag handlers and their tests. */
export function moveWithin<T>(items: T[], from: number, to: number): T[] | null {
  if (from === to) return null;
  if (from < 0 || from >= items.length) return null;
  if (to < 0 || to >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Live documents that reference this page. */
export async function docsWithPage(pageId: string): Promise<Doc[]> {
  return (await allLiveDocs()).filter((doc) => doc.pageIds.includes(pageId));
}
