/**
 * Committing a resolved import plan to the store.
 *
 * By the time a plan reaches here the user has confirmed or rejected every near match, so each row
 * carries either an existing `pageId` to reference or `null`, meaning "make a stub". Two things
 * this layer guarantees:
 *
 *   - Row order becomes page order, exactly. The document's `pageIds` are built in row sequence.
 *   - Repeated unmatched names within one import collapse to a single library page. A sheet that
 *     lists the same new song twice should not litter the library with two identical stubs; the
 *     second reference points at the same page, which is also how a reprise stays correct.
 */

import { db } from './db';
import { createPage, updatePage, normaliseTags } from './pages';
import { createDoc, setPageOrder } from './documents';
import { tightKey } from '../core/normalize';
import type { RowInput } from '../core/import/columns';

export type ResolvedRow = {
  input: RowInput;
  /** An existing page to reference, or `null` to create a stub from `input`. */
  pageId: string | null;
};

export type ImportDestination =
  | { kind: 'new'; name: string }
  /** Apply the sheet as the running order of an existing document, replacing what was there. */
  | { kind: 'existing'; id: string };

export type ImportResult = {
  docId: string;
  /** Stub pages created for rows that matched nothing. */
  created: number;
  /** Rows that attached to a page already in the library. */
  referenced: number;
};

export async function commitImport(
  rows: ResolvedRow[],
  dest: ImportDestination,
): Promise<ImportResult> {
  const orderedIds: string[] = [];
  let created = 0;
  let referenced = 0;

  // Stubs made earlier in this same import, so a name repeated in the sheet reuses its page.
  const stubByKey = new Map<string, string>();

  for (const row of rows) {
    if (row.pageId) {
      orderedIds.push(row.pageId);
      referenced += 1;
      continue;
    }

    const key = tightKey({ song: row.input.song, artist: row.input.artist });
    const existingStub = stubByKey.get(key);
    if (existingStub) {
      orderedIds.push(existingStub);
      continue;
    }

    const page = await createPage({
      song: row.input.song,
      artist: row.input.artist,
      tags: row.input.tags,
      // No lyrics: that is what makes it a stub, flagged in the UI until it is filled in.
    });
    stubByKey.set(key, page.id);
    orderedIds.push(page.id);
    created += 1;
  }

  let docId: string;
  if (dest.kind === 'new') {
    const doc = await createDoc(dest.name, orderedIds);
    docId = doc.id;
  } else {
    await setPageOrder(dest.id, orderedIds);
    docId = dest.id;
  }

  return { docId, created, referenced };
}

/** Applies any tags an import row carries to a page that already existed. */
export async function applyImportedTags(rows: ResolvedRow[]): Promise<void> {
  // Tags on an exact/near match are additive: importing a sheet that tags "Ring of Fire" as
  // "encore" should add that tag without disturbing the page's lyrics or existing tags.
  for (const row of rows) {
    if (!row.pageId || row.input.tags.length === 0) continue;
    const page = await db.pages.get(row.pageId);
    if (!page) continue;
    const merged = normaliseTags([...page.tags, ...row.input.tags]);
    if (merged.length !== page.tags.length) {
      await updatePage(row.pageId, { tags: merged });
    }
  }
}
