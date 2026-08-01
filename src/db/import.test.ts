import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createPage } from './pages';
import { createDoc, getDoc } from './documents';
import { commitImport, applyImportedTags } from './import';
import type { ResolvedRow } from './import';
import { rowsFromMatrix } from '../core/import/columns';

beforeEach(async () => {
  await db.pages.clear();
  await db.documents.clear();
  await db.settings.clear();
});

function resolved(names: string[], pageIds: (string | null)[]): ResolvedRow[] {
  const rows = rowsFromMatrix(
    names.map((n) => [n]),
    { roles: ['name'], hasHeader: false },
  );
  return rows.map((input, i) => ({ input, pageId: pageIds[i] ?? null }));
}

describe('commitImport', () => {
  it('creates a new document whose order is the sheet order', async () => {
    const rows = resolved(
      ['A - X', 'B - Y', 'C - Z'],
      [null, null, null],
    );
    const result = await commitImport(rows, { kind: 'new', name: 'Friday set' });

    const doc = await getDoc(result.docId);
    expect(doc?.name).toBe('Friday set');
    expect(result.created).toBe(3);

    const songs = await Promise.all(doc!.pageIds.map((id) => db.pages.get(id)));
    expect(songs.map((p) => p?.song)).toEqual(['A', 'B', 'C']);
  });

  it('creates stubs with no lyrics for unmatched rows', async () => {
    const rows = resolved(['New Song - Nobody'], [null]);
    await commitImport(rows, { kind: 'new', name: 'set' });
    const page = (await db.pages.toArray())[0];
    expect(page?.lyrics).toBe('');
  });

  it('reuses one page for a name repeated in the same sheet — reprise-safe', async () => {
    const rows = resolved(['Reprise - Band', 'Other - Band', 'Reprise - Band'], [null, null, null]);
    const result = await commitImport(rows, { kind: 'new', name: 'set' });

    expect(result.created).toBe(2);
    const doc = await getDoc(result.docId);
    expect(doc!.pageIds).toHaveLength(3);
    expect(doc!.pageIds[0]).toBe(doc!.pageIds[2]);
  });

  it('references an existing page rather than duplicating it', async () => {
    const existing = await createPage({ song: 'Known', artist: 'Star', lyrics: 'real words' });
    const rows = resolved(['Known - Star', 'Fresh - New'], [existing.id, null]);
    const result = await commitImport(rows, { kind: 'new', name: 'set' });

    expect(result.referenced).toBe(1);
    expect(result.created).toBe(1);
    const doc = await getDoc(result.docId);
    expect(doc!.pageIds[0]).toBe(existing.id);
  });

  it('applies the sheet as the order of an existing document', async () => {
    const doc = await createDoc('Existing', []);
    const rows = resolved(['One - A', 'Two - B'], [null, null]);
    const result = await commitImport(rows, { kind: 'existing', id: doc.id });

    expect(result.docId).toBe(doc.id);
    const after = await getDoc(doc.id);
    expect(after!.pageIds).toHaveLength(2);
  });

  it('adds imported tags to a referenced page without touching its lyrics', async () => {
    const existing = await createPage({ song: 'Known', artist: 'Star', lyrics: 'keep me' });
    const rows = rowsFromMatrix(
      [['Known', 'Star', 'encore']],
      { roles: ['song', 'artist', 'tags'], hasHeader: false },
    );
    const resolvedRows: ResolvedRow[] = [{ input: rows[0]!, pageId: existing.id }];
    await applyImportedTags(resolvedRows);

    const after = await db.pages.get(existing.id);
    expect(after?.tags).toEqual(['encore']);
    expect(after?.lyrics).toBe('keep me');
  });
});
