import { describe, expect, it } from 'vitest';
import {
  formatChord,
  isChordLine,
  isChordToken,
  parseChord,
  prefersFlats,
  transposeChord,
} from './chords';

describe('parseChord', () => {
  it('parses a bare major triad', () => {
    expect(parseChord('G')).toMatchObject({ root: 'G', accidental: '', suffix: '' });
  });

  it('parses accidentals, sharps and flats', () => {
    expect(parseChord('F#')).toMatchObject({ root: 'F', accidental: '#' });
    expect(parseChord('Bb')).toMatchObject({ root: 'B', accidental: 'b' });
  });

  it('normalises the unicode sharp and flat signs', () => {
    expect(parseChord('F♯')).toMatchObject({ root: 'F', accidental: '#' });
    expect(parseChord('B♭')).toMatchObject({ root: 'B', accidental: 'b' });
  });

  it('parses qualities and extensions', () => {
    expect(parseChord('Cmaj7')).toMatchObject({ root: 'C', suffix: 'maj7' });
    expect(parseChord('Dm')).toMatchObject({ root: 'D', suffix: 'm' });
    expect(parseChord('G7')).toMatchObject({ root: 'G', suffix: '7' });
    expect(parseChord('Asus4')).toMatchObject({ root: 'A', suffix: 'sus4' });
    expect(parseChord('C7b5')).toMatchObject({ root: 'C', suffix: '7b5' });
  });

  it('parses a slash bass', () => {
    expect(parseChord('C/G')).toMatchObject({ root: 'C', bass: 'G' });
    expect(parseChord('D/F#')).toMatchObject({ root: 'D', bass: 'F', bassAccidental: '#' });
  });

  it('rejects ordinary words that start with a note letter', () => {
    for (const word of ['Bad', 'Dim', 'Ace', 'Fade', 'Bag', 'Ebb', 'Cab', 'Gaze', 'Age']) {
      expect(parseChord(word), word).toBeNull();
    }
  });

  it('rejects a slash bass that is really a word', () => {
    expect(parseChord('C/Go')).toBeNull();
  });

  it('rejects a non-note root', () => {
    expect(parseChord('H')).toBeNull();
    expect(parseChord('8')).toBeNull();
  });
});

describe('isChordLine', () => {
  it('accepts a row of chords', () => {
    expect(isChordLine('G           C        D')).toBe(true);
    expect(isChordLine('Am   F   C   G')).toBe(true);
  });

  it('accepts chords among bar lines and repeats', () => {
    expect(isChordLine('| G | C | D7 | %  |')).toBe(true);
    expect(isChordLine('C   G   x2')).toBe(true);
  });

  it('rejects a lyric line', () => {
    expect(isChordLine('And it burns burns burns')).toBe(false);
    expect(isChordLine('the ring of fire')).toBe(false);
  });

  it('rejects a line of words that each start with a note letter', () => {
    // The failure mode worth guarding: a real sentence of note-letter words.
    expect(isChordLine('Big cats are dancing')).toBe(false);
  });

  it('rejects an empty line', () => {
    expect(isChordLine('   ')).toBe(false);
  });
});

describe('transposeChord', () => {
  const t = (chord: string, semis: number, flats = false) =>
    formatChord(transposeChord(parseChord(chord)!, semis, flats));

  it('moves up by semitones', () => {
    expect(t('C', 2)).toBe('D');
    expect(t('G', 5)).toBe('C');
  });

  it('wraps around the octave', () => {
    expect(t('B', 1)).toBe('C');
    expect(t('A', 3)).toBe('C');
  });

  it('moves down by negative semitones', () => {
    expect(t('C', -2)).toBe('A#');
    expect(t('C', -2, true)).toBe('Bb');
  });

  it('keeps the quality and extension', () => {
    expect(t('Dm7', 2)).toBe('Em7');
    expect(t('Cmaj7', 5)).toBe('Fmaj7');
  });

  it('transposes the slash bass too', () => {
    expect(t('C/G', 2)).toBe('D/A');
    expect(t('D/F#', -2)).toBe('C/E');
  });

  it('honours the flat preference', () => {
    expect(t('C', 1, true)).toBe('Db');
    expect(t('C', 1, false)).toBe('C#');
  });
});

describe('prefersFlats', () => {
  it('is true for a chart landing in a flat key', () => {
    // C up 3 → Eb, a flat key.
    expect(prefersFlats(parseChord('C'), 3)).toBe(true);
  });

  it('is false for a chart landing in a sharp key', () => {
    // C up 2 → D, a sharp key.
    expect(prefersFlats(parseChord('C'), 2)).toBe(false);
  });

  it('is false with no chord to key off', () => {
    expect(prefersFlats(null, 3)).toBe(false);
  });
});

describe('isChordToken', () => {
  it('agrees with parseChord', () => {
    expect(isChordToken('Am7')).toBe(true);
    expect(isChordToken('Along')).toBe(false);
  });
});
