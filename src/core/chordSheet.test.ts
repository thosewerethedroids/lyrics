import { describe, expect, it } from 'vitest';
import { firstChordOf, parseChordChart, transposeBody } from './chordSheet';
import { formatChord } from './chords';
import type { Block } from './chordSheet';

/** Compact a row into `chord:text|chord:text` for readable assertions. Notes show as `note:`. */
function row(block: Block | undefined): string {
  if (!block || block.kind !== 'row') return `<${block?.kind ?? 'missing'}>`;
  return block.segments
    .map((s) => (s.note ? `note:${s.text}` : `${s.chord ? formatChord(s.chord) : ''}:${s.text}`))
    .join('|');
}

describe('parseChordChart — sections', () => {
  it('recognises a bracketed section label', () => {
    const { blocks } = parseChordChart('[Chorus]');
    expect(blocks[0]).toEqual({ kind: 'section', label: 'Chorus' });
  });

  it('recognises a bare section label with a colon', () => {
    const { blocks } = parseChordChart('Verse 2:');
    expect(blocks[0]).toEqual({ kind: 'section', label: 'Verse 2' });
  });

  it('does not mistake a lyric for a section', () => {
    const { blocks } = parseChordChart('Breaking all the rules again tonight');
    expect(blocks[0]?.kind).toBe('text');
  });
});

describe('bracket grammar', () => {
  it('treats a whole line of {...} as a performance note', () => {
    const { blocks } = parseChordChart('{Chorus 2x}');
    expect(blocks[0]).toEqual({ kind: 'note', text: 'Chorus 2x' });
  });

  it('treats an inline {...} as a note run, not as lyrics', () => {
    const { blocks } = parseChordChart('Sing it [G]loud {2x}');
    expect(row(blocks[0])).toBe(':Sing it |G:loud |note:2x');
  });

  it('keeps (parentheses) as literal text', () => {
    const { blocks } = parseChordChart('(quietly)');
    expect(blocks[0]).toEqual({ kind: 'text', text: '(quietly)' });
  });

  it('does not treat a parenthesised line as a section', () => {
    const { blocks } = parseChordChart('(Chorus)');
    expect(blocks[0]?.kind).toBe('text');
  });

  it('keeps backing vocals in parentheses inside a chorded line', () => {
    const { blocks } = parseChordChart('[G]Hold on (ooh-ooh)');
    expect(row(blocks[0])).toBe('G:Hold on (ooh-ooh)');
  });

  it('keeps an unrecognised [token] verbatim rather than dropping it', () => {
    const { blocks } = parseChordChart('Take it [somehow] away');
    expect(blocks[0]).toEqual({ kind: 'text', text: 'Take it [somehow] away' });
  });

  it('does not bind a chord line to a {note} beneath it', () => {
    const { blocks } = parseChordChart('G   C\n{Chorus 2x}');
    expect(row(blocks[0])).toBe('G:|C:');
    expect(blocks[1]).toEqual({ kind: 'note', text: 'Chorus 2x' });
  });
});

describe('parseChordChart — chord-over-lyric', () => {
  it('splits the lyric at the chord columns', () => {
    //          col 0        col 12   col 21
    const body = ['G           C        G', 'Love is a burning thing'].join('\n');
    const { blocks, hasChords } = parseChordChart(body);
    expect(hasChords).toBe(true);
    expect(row(blocks[0])).toBe('G:Love is a bu|C:rning thi|G:ng');
  });

  it('keeps a leading run of lyric before the first chord', () => {
    const body = ['      C', 'Well I fell', ''].join('\n');
    const { blocks } = parseChordChart(body);
    expect(row(blocks[0])).toBe(':Well I|C: fell');
  });

  it('treats a chord line with no lyric beneath as a chord-only row', () => {
    const { blocks } = parseChordChart('G   C   D');
    expect(row(blocks[0])).toBe('G:|C:|D:');
  });

  it('does not consume a following chord line as lyrics', () => {
    const body = ['G   C', 'Am  F'].join('\n');
    const { blocks } = parseChordChart(body);
    expect(row(blocks[0])).toBe('G:|C:');
    expect(row(blocks[1])).toBe('Am:|F:');
  });
});

describe('parseChordChart — inline brackets', () => {
  it('parses chords embedded in the lyric', () => {
    const { blocks, hasChords } = parseChordChart('[G]Love is a [C]burning [G]thing');
    expect(hasChords).toBe(true);
    expect(row(blocks[0])).toBe('G:Love is a |C:burning |G:thing');
  });

  it('leaves a bracketed non-chord as literal text', () => {
    const { blocks } = parseChordChart('[Verse] the words begin');
    // `[Verse]` alone on a line is a section; mid-line here it stays text.
    expect(blocks[0]?.kind).toBe('text');
  });

  it('transposing leaves {notes} and (parentheses) untouched', () => {
    const body = '{Chorus 2x}\n[G]Hold on (ooh-ooh)';
    expect(transposeBody(body, 2)).toBe('{Chorus 2x}\n[A]Hold on (ooh-ooh)');
  });
});

describe('parseChordChart — plain text', () => {
  it('reports no chords for a lyrics-only body', () => {
    const { hasChords, blocks } = parseChordChart('Just a line\nand another');
    expect(hasChords).toBe(false);
    expect(blocks.every((b) => b.kind === 'text' || b.kind === 'blank')).toBe(true);
  });
});

describe('firstChordOf', () => {
  it('finds the first chord regardless of format', () => {
    expect(formatChord(firstChordOf('some intro\nG   C')!)).toBe('G');
    expect(formatChord(firstChordOf('[D]Hello')!)).toBe('D');
  });

  it('is null when there are no chords', () => {
    expect(firstChordOf('no chords here')).toBeNull();
  });
});

describe('transposeBody', () => {
  it('transposes inline chords', () => {
    expect(transposeBody('[C]Hello [G]world', 2)).toBe('[D]Hello [A]world');
  });

  it('transposes a chord line and keeps it roughly aligned', () => {
    const body = ['C       G', 'Hello   world'].join('\n');
    const out = transposeBody(body, 2).split('\n');
    expect(out[0]?.trimEnd()).toBe('D       A');
    expect(out[1]).toBe('Hello   world');
  });

  it('leaves section labels and lyrics untouched', () => {
    const body = ['[Chorus]', 'G', 'Ring of fire'].join('\n');
    const out = transposeBody(body, 2).split('\n');
    expect(out[0]).toBe('[Chorus]');
    expect(out[2]).toBe('Ring of fire');
  });

  it('is a no-op at zero semitones', () => {
    const body = 'C   G\nwords';
    expect(transposeBody(body, 0)).toBe(body);
  });

  it('does not collide chords when a transpose widens one', () => {
    // F -> F# is one wider; the following chord must still be readable, not overwritten.
    const body = 'F    C';
    const out = transposeBody(body, 1);
    expect(out).toMatch(/^F#\s+C#$/);
  });

  it('round-trips up then down to the original spelling in a sharp key', () => {
    const body = '[G]Test [D]line';
    expect(transposeBody(transposeBody(body, 2), -2)).toBe(body);
  });
});
