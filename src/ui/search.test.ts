import { describe, expect, it } from 'vitest';
import { isStub, matchesQuery, matchesTags, sortPages } from './search';
import type { Page } from '../db/types';

function page(over: Partial<Page> = {}): Page {
  return {
    id: over.id ?? 'id',
    song: over.song ?? 'Ring of Fire',
    artist: over.artist ?? 'Johnny Cash',
    title: `${over.song ?? 'Ring of Fire'} - ${over.artist ?? 'Johnny Cash'}`,
    lyrics: over.lyrics ?? 'Love is a burning thing',
    tags: over.tags ?? [],
    notes: over.notes ?? '',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    deviceId: 'device',
    matchKey: 'ring of fire|johnny cash',
    ...over,
  } as Page;
}

describe('matchesQuery', () => {
  it('matches everything on an empty query', () => {
    expect(matchesQuery(page(), '   ')).toBe(true);
  });

  it('matches on the song', () => {
    expect(matchesQuery(page(), 'ring')).toBe(true);
  });

  it('matches on the artist', () => {
    expect(matchesQuery(page(), 'cash')).toBe(true);
  });

  it('matches on a word buried in the lyrics', () => {
    expect(matchesQuery(page(), 'burning')).toBe(true);
  });

  it('matches on a tag', () => {
    expect(matchesQuery(page({ tags: ['encore'] }), 'encore')).toBe(true);
  });

  it('requires every token, in any order and any field', () => {
    expect(matchesQuery(page(), 'johnny fire')).toBe(true);
    expect(matchesQuery(page(), 'fire johnny')).toBe(true);
    expect(matchesQuery(page(), 'johnny banjo')).toBe(false);
  });

  it('ignores case and punctuation', () => {
    expect(matchesQuery(page({ song: "Rockin' Chair" }), 'ROCKIN')).toBe(true);
  });
});

describe('matchesTags', () => {
  const tagged = page({ tags: ['opener', 'acoustic', 'singalong'] });

  it('matches everything when nothing is selected', () => {
    expect(matchesTags(tagged, { tags: [], mode: 'all' })).toBe(true);
  });

  it('all — requires every selected tag', () => {
    expect(matchesTags(tagged, { tags: ['opener', 'acoustic'], mode: 'all' })).toBe(true);
    expect(matchesTags(tagged, { tags: ['opener', 'encore'], mode: 'all' })).toBe(false);
  });

  it('any — requires at least one selected tag', () => {
    expect(matchesTags(tagged, { tags: ['opener', 'encore'], mode: 'any' })).toBe(true);
    expect(matchesTags(tagged, { tags: ['encore', 'slow'], mode: 'any' })).toBe(false);
  });

  it('compares tags case-insensitively', () => {
    expect(matchesTags(tagged, { tags: ['OPENER'], mode: 'all' })).toBe(true);
  });

  it('excludes a page with no tags once a filter is on', () => {
    expect(matchesTags(page({ tags: [] }), { tags: ['opener'], mode: 'any' })).toBe(false);
  });
});

describe('sortPages', () => {
  const a = page({ id: 'a', song: 'Apple', artist: 'Zeta', updatedAt: '2026-01-01T00:00:00.000Z' });
  const b = page({ id: 'b', song: 'Zebra', artist: 'Alpha', updatedAt: '2026-06-01T00:00:00.000Z' });

  it('sorts by song title', () => {
    expect(sortPages([b, a], 'title').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('sorts by artist', () => {
    expect(sortPages([a, b], 'artist').map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('sorts most recently edited first', () => {
    expect(sortPages([a, b], 'edited').map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [b, a];
    sortPages(input, 'title');
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('isStub', () => {
  it('is true when there are no lyrics to read', () => {
    expect(isStub(page({ lyrics: '   \n ' }))).toBe(true);
  });

  it('is false once lyrics exist', () => {
    expect(isStub(page({ lyrics: 'a line' }))).toBe(false);
  });
});
