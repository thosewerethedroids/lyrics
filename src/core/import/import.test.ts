import { describe, expect, it } from 'vitest';
import { parseDelimited } from './spreadsheet';
import { detectMapping, rowsFromMatrix } from './columns';
import { planImport } from './planner';
import { tightKey } from '../normalize';
import type { Page } from '../../db/types';

function page(song: string, artist: string, over: Partial<Page> = {}): Page {
  return {
    id: `${song}::${artist}`,
    song,
    artist,
    title: artist ? `${song} - ${artist}` : song,
    lyrics: 'x',
    tags: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deviceId: 'test',
    matchKey: tightKey({ song, artist }),
    ...over,
  };
}

describe('parseDelimited', () => {
  it('reads one page name per line as a single column', () => {
    const m = parseDelimited('Ring of Fire - Johnny Cash\nWagon Wheel - Old Crow Medicine Show');
    expect(m).toEqual([
      ['Ring of Fire - Johnny Cash'],
      ['Wagon Wheel - Old Crow Medicine Show'],
    ]);
  });

  it('detects tab and comma delimiters and drops blank lines', () => {
    const tsv = parseDelimited('song\tartist\nRing of Fire\tJohnny Cash\n\nWagon Wheel\tOld Crow');
    expect(tsv).toEqual([
      ['song', 'artist'],
      ['Ring of Fire', 'Johnny Cash'],
      ['Wagon Wheel', 'Old Crow'],
    ]);
  });

  it('preserves row order exactly', () => {
    const m = parseDelimited('C\nA\nB');
    expect(m.map((r) => r[0])).toEqual(['C', 'A', 'B']);
  });
});

describe('detectMapping', () => {
  it('reads roles from a header row', () => {
    const m = [['Song', 'Artist', 'Tags'], ['Ring of Fire', 'Johnny Cash', 'encore, opener']];
    expect(detectMapping(m)).toEqual({ roles: ['song', 'artist', 'tags'], hasHeader: true });
  });

  it('treats a single column as a combined name with no header', () => {
    const m = [['Ring of Fire - Johnny Cash'], ['Wagon Wheel - Old Crow']];
    expect(detectMapping(m)).toEqual({ roles: ['name'], hasHeader: false });
  });

  it('guesses song then artist for a headerless two-column sheet', () => {
    const m = [['Ring of Fire', 'Johnny Cash'], ['Wagon Wheel', 'Old Crow']];
    expect(detectMapping(m)).toEqual({ roles: ['song', 'artist'], hasHeader: false });
  });
});

describe('rowsFromMatrix', () => {
  it('parses a combined name column on the last spaced dash', () => {
    const m = [['Marquee Moon - Live - Television']];
    const rows = rowsFromMatrix(m, { roles: ['name'], hasHeader: false });
    expect(rows[0]).toMatchObject({ song: 'Marquee Moon - Live', artist: 'Television', index: 0 });
  });

  it('splits tags on commas and semicolons', () => {
    const m = [['Song', 'Tags'], ['Ring of Fire', 'encore; opener, cash']];
    const rows = rowsFromMatrix(m, { roles: ['song', 'tags'], hasHeader: true });
    expect(rows[0]!.tags).toEqual(['cash', 'encore', 'opener']);
  });

  it('numbers rows in sheet order after skipping the header', () => {
    const m = [['song'], ['A'], ['B'], ['C']];
    const rows = rowsFromMatrix(m, { roles: ['song'], hasHeader: true });
    expect(rows.map((r) => [r.index, r.song])).toEqual([[0, 'A'], [1, 'B'], [2, 'C']]);
  });
});

describe('planImport', () => {
  const library = [
    page('Ring of Fire', 'Johnny Cash'),
    page('The Weight', 'The Band'),
    page('Wagon Wheel', 'Old Crow Medicine Show'),
  ];

  function rows(...names: string[]) {
    return rowsFromMatrix(names.map((n) => [n]), { roles: ['name'], hasHeader: false });
  }

  it('matches an identical name exactly and applies it', () => {
    const plan = planImport(rows('Ring of Fire - Johnny Cash'), library);
    expect(plan.rows[0]).toMatchObject({ kind: 'exact', pageId: 'Ring of Fire::Johnny Cash' });
  });

  it('offers a near match when a leading article differs', () => {
    const plan = planImport(rows('Weight - The Band'), library);
    expect(plan.rows[0]).toMatchObject({ kind: 'near', reason: 'article-or-suffix' });
  });

  it('offers a near match by re-splitting a bare hyphen', () => {
    const plan = planImport(rows('Ring of Fire-Johnny Cash'), library);
    expect(plan.rows[0]).toMatchObject({
      kind: 'near',
      reason: 'hyphen',
      pageId: 'Ring of Fire::Johnny Cash',
    });
  });

  it('offers a near match for a small typo', () => {
    const plan = planImport(rows('Wagon Whele - Old Crow Medicine Show'), library);
    expect(plan.rows[0]).toMatchObject({ kind: 'near', reason: 'typo' });
  });

  it('marks an unknown song as no match, to become a stub', () => {
    const plan = planImport(rows('A Brand New Song - Nobody'), library);
    expect(plan.rows[0]!.kind).toBe('none');
  });

  it('matches a title-only row to the one library song with that title', () => {
    const plan = planImport(rows('Wagon Wheel'), library);
    expect(plan.rows[0]).toMatchObject({
      kind: 'exact',
      pageId: 'Wagon Wheel::Old Crow Medicine Show',
    });
  });

  it('asks which song when a bare title is shared by several artists', () => {
    const two = [page('Valerie', 'Amy Winehouse'), page('Valerie', 'Steve Winwood')];
    const plan = planImport(rows('Valerie'), two);
    expect(plan.rows[0]!.kind).toBe('near');
    expect(plan.rows[0]!.reason).toBe('same-title');
    expect(plan.rows[0]!.candidates).toHaveLength(2);
    expect(plan.rows[0]!.candidates!.map((c) => c.pageId).sort()).toEqual([
      'Valerie::Amy Winehouse',
      'Valerie::Steve Winwood',
    ]);
  });

  it('catches a letter-swap typo in a title-only row', () => {
    const plan = planImport(rows('Wagon Whele'), library);
    expect(plan.rows[0]).toMatchObject({
      kind: 'near',
      reason: 'typo',
      pageId: 'Wagon Wheel::Old Crow Medicine Show',
    });
  });

  it('offers a partial title as a prefix match', () => {
    const lib = [page('Wonderwall', 'Oasis')];
    const plan = planImport(rows('Wonder'), lib);
    expect(plan.rows[0]).toMatchObject({
      kind: 'near',
      reason: 'prefix',
      pageId: 'Wonderwall::Oasis',
    });
  });

  it('gives a near row a ranked candidate list for the chooser', () => {
    const plan = planImport(rows('Weight - The Band'), library);
    expect(plan.rows[0]!.kind).toBe('near');
    expect((plan.rows[0]!.candidates ?? []).length).toBeGreaterThanOrEqual(1);
    expect(plan.rows[0]!.candidates![0]!.pageId).toBe('The Weight::The Band');
  });

  it('counts each outcome and preserves order', () => {
    const plan = planImport(
      rows('Ring of Fire - Johnny Cash', 'Totally Unknown - Someone', 'Weight - The Band'),
      library,
    );
    expect(plan.counts).toEqual({ exact: 1, near: 1, none: 1 });
    expect(plan.rows.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});
