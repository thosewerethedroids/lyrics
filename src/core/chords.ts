/**
 * Chord recognition and transposition.
 *
 * Recognition has to be *strict*, because it is what tells a chord line apart from a lyric line.
 * `Bad` must not parse as B-flat-something and `Dim` must not parse as D-something, or a verse
 * gets rendered as a chord run. The suffix grammar below is a whitelist for exactly that reason:
 * a bare accidental is only allowed after a digit (`C7b5`), never on its own (`Ebb`).
 */

export type Chord = {
  root: string;
  /** '', '#' or 'b', already normalised from the unicode sharp and flat signs. */
  accidental: string;
  /** Everything after the root: `m`, `maj7`, `sus4`, `add9`, … */
  suffix: string;
  /** Slash bass, if any: the `G` of `C/G`. */
  bass?: string;
  bassAccidental?: string;
};

/**
 * A suffix is a run of known quality words, extension numbers, and parenthesised alterations.
 *
 * Ordering inside the alternation matters: the longer words come first so `maj` is not consumed
 * as `m` followed by an unparseable `aj`.
 */
const SUFFIX_RE =
  /^(?:major|minor|maj|min|sus|add|dim|aug|alt|dom|no|omit|m|M|°|ø|Δ|\+|-|\d+|[#b]\d+|\(|\)|,|\/)*$/;

const ROOT_RE = /^[A-G]$/;

function normaliseAccidental(text: string): string {
  if (text === '♯') return '#';
  if (text === '♭') return 'b';
  return text;
}

/** Tokens that belong on a chord line without being chords: bar lines, repeats, rests. */
const CHORD_LINE_FURNITURE = /^(?:\||\|\||:\||\|:|%|-|–|—|\(?[xX]\s?\d+\)?|\d+[xX]|N\.?C\.?)$/;

/** Parses one token. Returns null when it is not a chord. */
export function parseChord(token: string): Chord | null {
  const text = token.trim();
  if (!text) return null;

  // Split the slash bass off first, so the suffix grammar never has to deal with it.
  const slash = text.lastIndexOf('/');
  let head = text;
  let bassPart = '';
  if (slash > 0) {
    head = text.slice(0, slash);
    bassPart = text.slice(slash + 1);
  }

  const root = head[0] ?? '';
  if (!ROOT_RE.test(root)) return null;

  let rest = head.slice(1);
  let accidental = '';
  const first = rest[0];
  if (first === '#' || first === 'b' || first === '♯' || first === '♭') {
    accidental = normaliseAccidental(first);
    rest = rest.slice(1);
  }

  if (!SUFFIX_RE.test(rest)) return null;

  const chord: Chord = { root, accidental, suffix: rest };

  if (bassPart) {
    const bassRoot = bassPart[0] ?? '';
    if (!ROOT_RE.test(bassRoot)) return null;
    let bassRest = bassPart.slice(1);
    let bassAccidental = '';
    const bassFirst = bassRest[0];
    if (bassFirst === '#' || bassFirst === 'b' || bassFirst === '♯' || bassFirst === '♭') {
      bassAccidental = normaliseAccidental(bassFirst);
      bassRest = bassRest.slice(1);
    }
    // A slash bass is a plain note. Anything trailing means this was not a chord.
    if (bassRest) return null;
    chord.bass = bassRoot;
    chord.bassAccidental = bassAccidental;
  }

  return chord;
}

export function isChordToken(token: string): boolean {
  return parseChord(token) !== null;
}

export function formatChord(chord: Chord): string {
  const head = `${chord.root}${chord.accidental}${chord.suffix}`;
  return chord.bass ? `${head}/${chord.bass}${chord.bassAccidental ?? ''}` : head;
}

/**
 * Is this whole line a row of chords rather than a line of words?
 *
 * Requires every token to be a chord or chord-line furniture, and at least one real chord. A
 * line of one bare letter (`A`) still counts — in a chord sheet that is a chord, and the cost of
 * getting it wrong is one oddly-styled line, not lost text.
 */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let chords = 0;
  for (const token of tokens) {
    if (isChordToken(token)) {
      chords += 1;
      continue;
    }
    if (CHORD_LINE_FURNITURE.test(token)) continue;
    return false;
  }
  return chords > 0;
}

// MARK: - Transposition

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const PITCH: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  'B#': 0,
};

/** Keys conventionally written with flats. Used to pick a spelling after transposing. */
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]);

function pitchOf(root: string, accidental: string): number | null {
  const value = PITCH[`${root}${accidental}`];
  return value === undefined ? null : value;
}

function nameFor(pitch: number, preferFlats: boolean): string {
  const table = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return table[((pitch % 12) + 12) % 12] as string;
}

function splitName(name: string): { root: string; accidental: string } {
  return { root: name[0] as string, accidental: name.slice(1) };
}

/** Transposes one chord by a number of semitones. */
export function transposeChord(chord: Chord, semitones: number, preferFlats: boolean): Chord {
  const pitch = pitchOf(chord.root, chord.accidental);
  if (pitch === null) return chord;

  const moved = splitName(nameFor(pitch + semitones, preferFlats));
  const next: Chord = { ...chord, root: moved.root, accidental: moved.accidental };

  if (chord.bass) {
    const bassPitch = pitchOf(chord.bass, chord.bassAccidental ?? '');
    if (bassPitch !== null) {
      const movedBass = splitName(nameFor(bassPitch + semitones, preferFlats));
      next.bass = movedBass.root;
      next.bassAccidental = movedBass.accidental;
    }
  }

  return next;
}

/**
 * Whether the result of transposing should be spelled with flats.
 *
 * Decided once for the whole sheet from where the first chord lands, so a song does not come out
 * half in sharps and half in flats. Approximating the key by the first chord is wrong for the
 * minority of songs that do not open on the tonic, but it produces a consistent, readable sheet
 * either way — which is the only thing this affects.
 */
export function prefersFlats(firstChord: Chord | null, semitones: number): boolean {
  if (!firstChord) return false;
  const pitch = pitchOf(firstChord.root, firstChord.accidental);
  if (pitch === null) return false;
  return FLAT_KEYS.has((((pitch + semitones) % 12) + 12) % 12);
}

/** Human-facing name of a transposition, for the control that applies it. */
export function describeSemitones(semitones: number): string {
  if (semitones === 0) return 'Original key';
  const direction = semitones > 0 ? 'up' : 'down';
  const count = Math.abs(semitones);
  return `${direction} ${count} ${count === 1 ? 'semitone' : 'semitones'}`;
}
