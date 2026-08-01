import type { Page } from '../db/types';
import { tight } from '../core/normalize';

/**
 * Library search.
 *
 * Every token must match somewhere in the page — song, artist, lyrics or tags — so typing
 * `johnny fire` finds "Ring of Fire - Johnny Cash" without caring about the order of the words.
 * Running over the whole library in JS is not a compromise at this size: a few hundred songs of
 * plain text is well under a megabyte, and it means search works on a lyric line, which no
 * IndexedDB index would give without a full-text layer.
 */

export type SortKey = 'title' | 'artist' | 'edited';

function haystack(page: Page): string {
  return tight(`${page.song} ${page.artist} ${page.tags.join(' ')} ${page.notes ?? ''} ${page.lyrics}`);
}

const haystacks = new WeakMap<Page, string>();

function cachedHaystack(page: Page): string {
  let value = haystacks.get(page);
  if (value === undefined) {
    value = haystack(page);
    haystacks.set(page, value);
  }
  return value;
}

export function matchesQuery(page: Page, query: string): boolean {
  const tokens = tight(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const text = cachedHaystack(page);
  return tokens.every((token) => text.includes(token));
}

export type TagFilter = {
  tags: string[];
  /** `all` — has every selected tag. `any` — has at least one. */
  mode: 'all' | 'any';
};

export function matchesTags(page: Page, filter: TagFilter): boolean {
  if (filter.tags.length === 0) return true;
  const own = new Set(page.tags.map(tight));
  const wanted = filter.tags.map(tight);
  return filter.mode === 'all'
    ? wanted.every((tag) => own.has(tag))
    : wanted.some((tag) => own.has(tag));
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortPages(pages: Page[], key: SortKey): Page[] {
  const sorted = [...pages];
  switch (key) {
    case 'title':
      sorted.sort((a, b) => collator.compare(a.song, b.song) || collator.compare(a.artist, b.artist));
      break;
    case 'artist':
      sorted.sort((a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.song, b.song));
      break;
    case 'edited':
      // Descending: the song you were just working on is the one you want next.
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
  }
  return sorted;
}

/** A page with no lyrics — created by an import that found no match, and waiting to be filled in. */
export function isStub(page: Page): boolean {
  return page.lyrics.trim().length === 0;
}
