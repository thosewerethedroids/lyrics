import { db } from './db';
import type { Doc, Page } from './types';
import { isLive } from './types';
import { nowIso, uuid } from '../core/ids';
import { displayTitle } from '../core/pageName';
import { tight, tightKey } from '../core/normalize';
import { getDeviceId } from './settings';

/** Fields a caller may set. Everything else is derived or managed by the store. */
export type PageDraft = {
  song: string;
  artist?: string;
  lyrics?: string;
  tags?: string[];
  notes?: string;
  transpose?: number;
};

export type PagePatch = Partial<PageDraft>;

/**
 * Fills in everything derived from `song`/`artist`, and stamps the write.
 *
 * Every mutation goes through here. `title` and `matchKey` are derived values that live in the
 * record, and the one way that gets dangerous is if some code path sets `song` without them —
 * a page whose `matchKey` is stale silently stops matching its own name on import.
 */
async function stamp(page: Page): Promise<Page> {
  const name = { song: page.song.trim(), artist: page.artist.trim() };
  return {
    ...page,
    song: name.song,
    artist: name.artist,
    title: displayTitle(name),
    matchKey: tightKey(name),
    updatedAt: nowIso(),
    deviceId: await getDeviceId(),
  };
}

export async function createPage(draft: PageDraft): Promise<Page> {
  const now = nowIso();
  const page = await stamp({
    id: uuid(),
    song: draft.song,
    artist: draft.artist ?? '',
    title: '',
    lyrics: draft.lyrics ?? '',
    tags: normaliseTags(draft.tags ?? []),
    notes: draft.notes ?? '',
    transpose: draft.transpose ?? 0,
    createdAt: now,
    updatedAt: now,
    deviceId: '',
    matchKey: '',
  });
  await db.pages.put(page);
  return page;
}

export async function updatePage(id: string, patch: PagePatch): Promise<Page | undefined> {
  const existing = await db.pages.get(id);
  if (!existing) return undefined;

  const merged: Page = {
    ...existing,
    ...(patch.song !== undefined ? { song: patch.song } : {}),
    ...(patch.artist !== undefined ? { artist: patch.artist } : {}),
    ...(patch.lyrics !== undefined ? { lyrics: patch.lyrics } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.transpose !== undefined ? { transpose: patch.transpose } : {}),
    ...(patch.tags !== undefined ? { tags: normaliseTags(patch.tags) } : {}),
  };

  const next = await stamp(merged);
  await db.pages.put(next);
  return next;
}

export async function getPage(id: string): Promise<Page | undefined> {
  return db.pages.get(id);
}

export async function getPages(ids: string[]): Promise<Map<string, Page>> {
  const rows = await db.pages.bulkGet([...new Set(ids)]);
  const map = new Map<string, Page>();
  for (const row of rows) if (row) map.set(row.id, row);
  return map;
}

export async function allLivePages(): Promise<Page[]> {
  return (await db.pages.toArray()).filter(isLive);
}

/**
 * Soft-deletes a page and drops every reference to it.
 *
 * Deleting from the library means the song is gone, so leaving dangling ids in documents would
 * make a setlist that renders a hole. Callers are expected to have shown the user
 * {@link documentsContaining} first — the confirmation names the affected documents.
 */
export async function deletePage(id: string): Promise<void> {
  const deviceId = await getDeviceId();
  const at = nowIso();

  await db.transaction('rw', db.pages, db.documents, async () => {
    const page = await db.pages.get(id);
    if (!page) return;
    await db.pages.put({ ...page, deletedAt: at, updatedAt: at, deviceId });

    const affected = (await db.documents.toArray()).filter(
      (doc) => isLive(doc) && doc.pageIds.includes(id),
    );
    for (const doc of affected) {
      await db.documents.put({
        ...doc,
        pageIds: doc.pageIds.filter((pageId) => pageId !== id),
        updatedAt: at,
        deviceId,
      });
    }
  });
}

/** Undo for {@link deletePage}. The reference removals are not restored — order is unknowable. */
export async function restorePage(id: string): Promise<void> {
  const page = await db.pages.get(id);
  if (!page) return;
  const { deletedAt: _dropped, ...rest } = page;
  await db.pages.put({ ...rest, updatedAt: nowIso(), deviceId: await getDeviceId() });
}

/** Live documents that reference this page, for the delete confirmation. */
export async function documentsContaining(pageId: string): Promise<Doc[]> {
  const docs = await db.documents.toArray();
  return docs.filter((doc) => isLive(doc) && doc.pageIds.includes(pageId));
}

// MARK: - Tags

/** Trims, drops blanks, and de-duplicates case-insensitively while keeping the typed casing. */
export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = tight(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export type TagCount = { tag: string; count: number };

/**
 * Every tag in use with its page count, most-used first.
 *
 * The count is the point: a tag applied to one page next to a near-identical one applied to forty
 * is how a typo announces itself.
 */
export async function tagCounts(): Promise<TagCount[]> {
  const pages = await allLivePages();
  const counts = new Map<string, { display: string; count: number }>();

  for (const page of pages) {
    for (const tag of page.tags) {
      const key = tight(tag);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { display: tag, count: 1 });
    }
  }

  return [...counts.values()]
    .map(({ display, count }) => ({ tag: display, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Renames a tag on every page that carries it. Returns how many pages changed. */
export async function renameTag(from: string, to: string): Promise<number> {
  const target = to.trim().replace(/\s+/g, ' ');
  if (!target) return 0;

  const fromKey = tight(from);
  const deviceId = await getDeviceId();
  const at = nowIso();
  let changed = 0;

  await db.transaction('rw', db.pages, async () => {
    const pages = (await db.pages.toArray()).filter(
      (page) => isLive(page) && page.tags.some((tag) => tight(tag) === fromKey),
    );
    for (const page of pages) {
      const tags = normaliseTags(
        page.tags.map((tag) => (tight(tag) === fromKey ? target : tag)),
      );
      await db.pages.put({ ...page, tags, updatedAt: at, deviceId });
      changed += 1;
    }
  });

  return changed;
}

/** Removes a tag from every page that carries it. Returns how many pages changed. */
export async function deleteTag(tag: string): Promise<number> {
  const key = tight(tag);
  const deviceId = await getDeviceId();
  const at = nowIso();
  let changed = 0;

  await db.transaction('rw', db.pages, async () => {
    const pages = (await db.pages.toArray()).filter(
      (page) => isLive(page) && page.tags.some((t) => tight(t) === key),
    );
    for (const page of pages) {
      await db.pages.put({
        ...page,
        tags: page.tags.filter((t) => tight(t) !== key),
        updatedAt: at,
        deviceId,
      });
      changed += 1;
    }
  });

  return changed;
}
