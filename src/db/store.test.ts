import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  createPage,
  deletePage,
  deleteTag,
  documentsContaining,
  normaliseTags,
  renameTag,
  restorePage,
  tagCounts,
  updatePage,
} from './pages';
import { appendPages, createDoc, getDoc, moveSlot, moveWithin, removeSlot } from './documents';
import { isLive } from './types';

beforeEach(async () => {
  await db.pages.clear();
  await db.documents.clear();
  await db.settings.clear();
});

describe('pages', () => {
  it('derives title and matchKey from song and artist', async () => {
    const page = await createPage({ song: '  Ring of Fire ', artist: ' Johnny Cash ' });
    expect(page.song).toBe('Ring of Fire');
    expect(page.title).toBe('Ring of Fire - Johnny Cash');
    expect(page.matchKey).toBe('ring of fire|johnny cash');
  });

  it('keeps the derived fields in step when the song is renamed', async () => {
    const page = await createPage({ song: 'Ring of Fyre', artist: 'Johnny Cash' });
    const updated = await updatePage(page.id, { song: 'Ring of Fire' });
    expect(updated?.title).toBe('Ring of Fire - Johnny Cash');
    expect(updated?.matchKey).toBe('ring of fire|johnny cash');
  });

  it('stamps a device id on every write', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    expect(page.deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('advances updatedAt but never createdAt', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updatePage(page.id, { lyrics: 'first verse' });
    expect(updated).toBeDefined();
    expect(updated?.createdAt).toBe(page.createdAt);
    expect((updated as { updatedAt: string }).updatedAt > page.updatedAt).toBe(true);
  });

  it('soft-deletes rather than dropping the row, so the deletion can sync', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    await deletePage(page.id);

    const stored = await db.pages.get(page.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBeTruthy();
    expect(isLive(stored!)).toBe(false);
  });

  it('removes the page from every document that referenced it', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    const other = await createPage({ song: 'The Weight' });
    const friday = await createDoc('Friday', [page.id, other.id]);
    const sunday = await createDoc('Sunday', [other.id, page.id]);

    await deletePage(page.id);

    expect((await getDoc(friday.id))?.pageIds).toEqual([other.id]);
    expect((await getDoc(sunday.id))?.pageIds).toEqual([other.id]);
  });

  it('names every affected document before a delete', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    await createDoc('Friday', [page.id]);
    await createDoc('Sunday', [page.id]);
    await createDoc('Unrelated', []);

    const affected = await documentsContaining(page.id);
    expect(affected.map((doc) => doc.name).sort()).toEqual(['Friday', 'Sunday']);
  });

  it('starts with no transposition', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    expect(page.transpose).toBe(0);
  });

  it('stores a transposition without touching the written lyrics', async () => {
    const page = await createPage({ song: 'Wagon Wheel', lyrics: '[G]Rock me mama' });
    const updated = await updatePage(page.id, { transpose: 2 });
    expect(updated?.transpose).toBe(2);
    // Non-destructive: the sheet is still written in its original key.
    expect(updated?.lyrics).toBe('[G]Rock me mama');
  });

  it('keeps the transposition when an unrelated field is edited', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    await updatePage(page.id, { transpose: -3 });
    const updated = await updatePage(page.id, { notes: 'capo 2' });
    expect(updated?.transpose).toBe(-3);
  });

  it('restores a soft-deleted page', async () => {
    const page = await createPage({ song: 'Wagon Wheel' });
    await deletePage(page.id);
    await restorePage(page.id);
    expect((await db.pages.get(page.id))?.deletedAt).toBeUndefined();
  });
});

describe('tags', () => {
  it('trims, drops blanks, and de-duplicates case-insensitively', () => {
    expect(normaliseTags([' Opener ', 'opener', '', 'Encore'])).toEqual(['Encore', 'Opener']);
  });

  it('counts usage across the library', async () => {
    await createPage({ song: 'A', tags: ['opener', 'acoustic'] });
    await createPage({ song: 'B', tags: ['opener'] });
    await createPage({ song: 'C', tags: ['encore'] });

    expect(await tagCounts()).toEqual([
      { tag: 'opener', count: 2 },
      { tag: 'acoustic', count: 1 },
      { tag: 'encore', count: 1 },
    ]);
  });

  it('ignores tags on deleted pages', async () => {
    const page = await createPage({ song: 'A', tags: ['opener'] });
    await deletePage(page.id);
    expect(await tagCounts()).toEqual([]);
  });

  it('renames a tag everywhere at once', async () => {
    await createPage({ song: 'A', tags: ['accoustic'] });
    await createPage({ song: 'B', tags: ['Accoustic'] });

    expect(await renameTag('accoustic', 'acoustic')).toBe(2);
    expect(await tagCounts()).toEqual([{ tag: 'acoustic', count: 2 }]);
  });

  it('merges into an existing tag without leaving a duplicate on the page', async () => {
    await createPage({ song: 'A', tags: ['acoustic', 'accoustic'] });
    await renameTag('accoustic', 'acoustic');
    const page = (await db.pages.toArray())[0];
    expect(page?.tags).toEqual(['acoustic']);
  });

  it('deletes a tag from every page', async () => {
    await createPage({ song: 'A', tags: ['opener', 'encore'] });
    expect(await deleteTag('opener')).toBe(1);
    expect((await db.pages.toArray())[0]?.tags).toEqual(['encore']);
  });
});

describe('documents', () => {
  it('keeps page order exactly as given', async () => {
    const doc = await createDoc('Set', ['c', 'a', 'b']);
    expect((await getDoc(doc.id))?.pageIds).toEqual(['c', 'a', 'b']);
  });

  it('allows the same page twice — a reprise is a real setlist', async () => {
    const doc = await createDoc('Set', ['a', 'b', 'a']);
    expect((await getDoc(doc.id))?.pageIds).toEqual(['a', 'b', 'a']);
  });

  it('removes one slot, not every copy of the page', async () => {
    const doc = await createDoc('Set', ['a', 'b', 'a']);
    await removeSlot(doc.id, 2);
    expect((await getDoc(doc.id))?.pageIds).toEqual(['a', 'b']);
  });

  it('appends to the end', async () => {
    const doc = await createDoc('Set', ['a']);
    await appendPages(doc.id, ['b', 'c']);
    expect((await getDoc(doc.id))?.pageIds).toEqual(['a', 'b', 'c']);
  });

  it('moves a slot and closes the gap behind it', async () => {
    const doc = await createDoc('Set', ['a', 'b', 'c', 'd']);
    await moveSlot(doc.id, 0, 2);
    expect((await getDoc(doc.id))?.pageIds).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('moveWithin', () => {
  it('moves forward', () => {
    expect(moveWithin(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves backward', () => {
    expect(moveWithin(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns null for a no-op or an out-of-range index', () => {
    expect(moveWithin(['a', 'b'], 1, 1)).toBeNull();
    expect(moveWithin(['a', 'b'], 5, 0)).toBeNull();
    expect(moveWithin(['a', 'b'], 0, 9)).toBeNull();
  });
});
