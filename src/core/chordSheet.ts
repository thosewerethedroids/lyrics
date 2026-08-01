/**
 * Turns a lyric body into a structured chord chart.
 *
 * ## Bracket grammar
 *
 * The three bracket styles each mean one thing, and never overlap:
 *
 * - `[G]` — **a chord.** Inline, attached to the syllable that follows it.
 * - `{Chorus 2x}` — **a performance note.** Directions to yourself, not words to sing.
 * - `(anything)` — **literal text.** Parentheses are part of the lyric and are printed as typed,
 *   which is what makes `(quietly)` and backing vocals like `(ooh-ooh)` safe to write.
 *
 * One deliberate exception: `[Chorus]` alone on a line is read as a section heading rather than
 * discarded. Square brackets mean chords, but every chord sheet in the wild labels its sections
 * that way, and "Chorus" is not a parseable chord — so the intent is unambiguous and honouring it
 * costs nothing.
 *
 * ## Two input styles
 *
 * Both are parsed into the same structure so the renderer can lay chords over syllables and
 * reflow at any width or font size:
 *
 * 1. **Chord line above lyric line** — the plain-text songbook format. Rigid: its alignment only
 *    survives in a fixed pitch at one size.
 * 2. **Inline brackets** — `[G]Love is a [C]burning thing`. Width-independent.
 */

import { formatChord, isChordLine, parseChord, prefersFlats, transposeChord } from './chords';
import type { Chord } from './chords';

/**
 * A run of the line.
 *
 * A chord with the text it sits over, or — when `note` is set — a performance direction that is
 * not sung. Either half of a lyric segment may be absent.
 */
export type Segment = {
  chord: Chord | null;
  text: string;
  /** True when this run is a `{...}` direction rather than lyrics. */
  note?: boolean;
};

export type Block =
  | { kind: 'section'; label: string }
  | { kind: 'note'; text: string }
  | { kind: 'row'; segments: Segment[] }
  | { kind: 'text'; text: string }
  | { kind: 'blank' };

export type ChordChart = {
  blocks: Block[];
  /** True when at least one chord was found — drives whether chord controls are offered at all. */
  hasChords: boolean;
};

const SECTION_WORDS =
  /^(intro|verse|chorus|pre-?chorus|bridge|outro|solo|refrain|tag|coda|interlude|instrumental|break|vamp|ending|hook)\b/i;

/** A whole line of `{...}` — a direction such as `{Chorus 2x}`. */
function braceNote(line: string): string | null {
  const match = /^\s*\{([^}]*)\}\s*$/.exec(line);
  if (!match) return null;
  return (match[1] ?? '').trim();
}

/**
 * A whole line of `[...]` that is not a chord — a section heading.
 *
 * Parentheses are deliberately not accepted here: `(Chorus)` is literal text under the grammar
 * above, and a backing vocal on its own line must survive as words.
 */
function bracketedSection(line: string): string | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return null;
  const label = (match[1] ?? '').trim();
  if (!label || parseChord(label)) return null;
  return label;
}

/** `Chorus:` or `Verse 2` on a line of its own, unbracketed. */
function bareSection(line: string): string | null {
  const text = line.trim();
  if (!text || text.length > 40) return null;
  if (!SECTION_WORDS.test(text)) return null;
  // Require the line to be a label, not a lyric that happens to open with "Break".
  if (!/[:：]$/.test(text) && !/^[\w#\- ]{0,40}$/.test(text)) return null;
  if (!/[:：]$/.test(text) && text.split(/\s+/).length > 3) return null;
  return text.replace(/[:：]\s*$/, '');
}

function sectionLabel(line: string): string | null {
  return bracketedSection(line) ?? bareSection(line);
}

/** Matches an inline `[...]` or `{...}` token. Parentheses are never a token. */
const INLINE_TOKEN = /\[([^\]]*)\]|\{([^}]*)\}/g;

/** Does this line carry inline markup that must be parsed rather than shown literally? */
function hasInlineMarkup(line: string): boolean {
  INLINE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN.exec(line)) !== null) {
    if (match[2] !== undefined) return true; // a {note}
    if (parseChord(match[1] ?? '')) return true; // a [chord]
  }
  return false;
}

/**
 * Splits a line into chord/lyric/note runs.
 *
 * A `[...]` that does not parse as a chord is kept verbatim, brackets and all, rather than being
 * dropped — an unrecognised token is far more likely to be something the writer meant than
 * something safe to delete.
 */
function parseInlineLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  let pending: Chord | null = null;
  let buffer = '';

  const flush = () => {
    if (pending !== null || buffer) segments.push({ chord: pending, text: buffer });
    pending = null;
    buffer = '';
  };

  INLINE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN.exec(line)) !== null) {
    const isNote = match[2] !== undefined;
    const inner = (isNote ? match[2] : match[1]) ?? '';

    if (isNote) {
      buffer += line.slice(cursor, match.index);
      flush();
      segments.push({ chord: null, text: inner.trim(), note: true });
      cursor = match.index + match[0].length;
      continue;
    }

    const chord = parseChord(inner);
    if (!chord) continue; // Not a chord: leave the token in the text exactly as written.

    buffer += line.slice(cursor, match.index);
    flush();
    pending = chord;
    cursor = match.index + match[0].length;
  }

  buffer += line.slice(cursor);
  flush();
  return segments;
}

/** Column positions of each chord token on a chord line. */
function chordColumns(line: string): { column: number; chord: Chord }[] {
  const out: { column: number; chord: Chord }[] = [];
  const token = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(line)) !== null) {
    const chord = parseChord(match[0]);
    if (chord) out.push({ column: match.index, chord });
  }
  return out;
}

/**
 * Splits a lyric line at the columns its chord line marks.
 *
 * A chord positioned past the end of the lyric — which happens on a trailing turnaround — still
 * gets a segment, with empty text, so the chord is never dropped.
 */
function pairChordLine(chordLine: string, lyricLine: string): Segment[] {
  const columns = chordColumns(chordLine);
  if (columns.length === 0) return [{ chord: null, text: lyricLine }];

  const segments: Segment[] = [];
  const firstColumn = columns[0]?.column ?? 0;
  if (firstColumn > 0) {
    segments.push({ chord: null, text: lyricLine.slice(0, firstColumn) });
  }

  for (let i = 0; i < columns.length; i += 1) {
    const here = columns[i] as { column: number; chord: Chord };
    const next = columns[i + 1];
    const start = Math.min(here.column, lyricLine.length);
    const end = next ? Math.min(next.column, lyricLine.length) : lyricLine.length;
    segments.push({ chord: here.chord, text: lyricLine.slice(start, end) });
  }

  return segments;
}

/** Renders a chord-only line — an intro, a turnaround, a solo — as segments with no lyrics. */
function chordOnlyRow(line: string): Segment[] {
  return chordColumns(line).map(({ chord }) => ({ chord, text: '' }));
}

/** A line that should not be consumed as the lyrics belonging to the chord line above it. */
function isStructural(line: string | undefined): boolean {
  if (line === undefined) return false;
  return braceNote(line) !== null || sectionLabel(line) !== null;
}

export function parseChordChart(body: string): ChordChart {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let hasChords = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;

    if (!line.trim()) {
      blocks.push({ kind: 'blank' });
      continue;
    }

    const note = braceNote(line);
    if (note !== null) {
      blocks.push({ kind: 'note', text: note });
      continue;
    }

    const label = sectionLabel(line);
    if (label) {
      blocks.push({ kind: 'section', label });
      continue;
    }

    if (hasInlineMarkup(line)) {
      const segments = parseInlineLine(line);
      if (segments.some((segment) => segment.chord)) hasChords = true;
      blocks.push({ kind: 'row', segments });
      continue;
    }

    if (isChordLine(line)) {
      hasChords = true;
      const next = lines[i + 1];
      // A chord line binds to the lyric line directly beneath it — unless there isn't one, or
      // what's beneath is itself a chord line (two bars of an intro) or a heading.
      if (next !== undefined && next.trim() && !isChordLine(next) && !isStructural(next)) {
        blocks.push({ kind: 'row', segments: pairChordLine(line, next) });
        i += 1;
      } else {
        blocks.push({ kind: 'row', segments: chordOnlyRow(line) });
      }
      continue;
    }

    blocks.push({ kind: 'text', text: line });
  }

  return { blocks, hasChords };
}

// MARK: - Transposition over the raw text

/** The first chord in the body, used to choose a sharp or flat spelling for the whole sheet. */
export function firstChordOf(body: string): Chord | null {
  const chart = parseChordChart(body);
  for (const block of chart.blocks) {
    if (block.kind !== 'row') continue;
    for (const segment of block.segments) if (segment.chord) return segment.chord;
  }
  return null;
}

/**
 * Rewrites every chord in the body, in place, preserving the layout.
 *
 * The awkward case is a chord line: `C` transposing to `C#` is one character wider, which would
 * shove everything after it out of alignment with the lyric beneath. Each chord is therefore
 * re-laid at its original column, and only pushed right when the previous chord genuinely needs
 * the room — so a transposed sheet stays readable as plain text, not only through the renderer.
 */
export function transposeBody(body: string, semitones: number): string {
  if (semitones === 0) return body;

  const preferFlats = prefersFlats(firstChordOf(body), semitones);
  const lines = body.replace(/\r\n?/g, '\n').split('\n');

  return lines
    .map((line) => {
      // Notes and headings hold no chords, and `(...)` is literal by definition.
      if (braceNote(line) !== null) return line;
      if (sectionLabel(line)) return line;
      if (hasInlineMarkup(line)) return transposeInline(line, semitones, preferFlats);
      if (isChordLine(line)) return transposeChordLine(line, semitones, preferFlats);
      return line;
    })
    .join('\n');
}

function transposeInline(line: string, semitones: number, preferFlats: boolean): string {
  // Only `[...]` is touched; `{...}` and `(...)` pass through untouched.
  return line.replace(/\[([^\]]*)\]/g, (whole, inner: string) => {
    const chord = parseChord(inner);
    if (!chord) return whole;
    return `[${formatChord(transposeChord(chord, semitones, preferFlats))}]`;
  });
}

function transposeChordLine(line: string, semitones: number, preferFlats: boolean): string {
  const token = /\S+/g;
  const pieces: { column: number; text: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = token.exec(line)) !== null) {
    const chord = parseChord(match[0]);
    pieces.push({
      column: match.index,
      text: chord ? formatChord(transposeChord(chord, semitones, preferFlats)) : match[0],
    });
  }

  let out = '';
  for (const piece of pieces) {
    // Keep the original column when it still fits, and always leave one space between tokens.
    const target = Math.max(piece.column, out.length === 0 ? 0 : out.length + 1);
    out = out.padEnd(target, ' ') + piece.text;
  }
  return out;
}
