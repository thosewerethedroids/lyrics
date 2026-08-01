import { useMemo } from 'react';
import { parseChordChart, transposeBody } from '../../core/chordSheet';
import { formatChord } from '../../core/chords';
import type { Block, Segment } from '../../core/chordSheet';

type Props = {
  body: string;
  /** Semitones to shift every chord by. 0 renders the written key. */
  transpose?: number;
  /** Hide chords entirely — lyrics-only, for singing without the changes. */
  showChords?: boolean;
};

/**
 * Renders a parsed chord chart.
 *
 * A chord sits in the normal text flow, as a small block above the syllable it lands on, so the
 * pairing survives any font size and reflows at any width — the thing raw monospaced text cannot
 * do on a phone. Each chorded syllable is one inline-flex column: chord on top, lyric beneath.
 * Because it is real inline flow, a long line wraps between syllables like ordinary text.
 */
export function ChordSheet({ body, transpose = 0, showChords = true }: Props) {
  const chart = useMemo(() => {
    const source = transpose && showChords ? transposeBody(body, transpose) : body;
    return parseChordChart(source);
  }, [body, transpose, showChords]);

  return (
    <div className="chart" data-chords={showChords && chart.hasChords ? 'on' : 'off'}>
      {chart.blocks.map((block, index) => (
        <BlockView key={index} block={block} showChords={showChords} />
      ))}
    </div>
  );
}

function BlockView({ block, showChords }: { block: Block; showChords: boolean }) {
  switch (block.kind) {
    case 'blank':
      return <div className="chart__blank" aria-hidden="true" />;
    case 'section':
      return <div className="chart__section">{block.label}</div>;
    case 'note':
      return <div className="chart__note">{block.text}</div>;
    case 'text':
      return <div className="chart__line chart__line--text">{block.text || ' '}</div>;
    case 'row':
      return (
        <div className="chart__line">
          {block.segments.map((segment, index) => (
            <SegmentView key={index} segment={segment} showChords={showChords} />
          ))}
        </div>
      );
  }
}

function SegmentView({ segment, showChords }: { segment: Segment; showChords: boolean }) {
  // A `{...}` direction: never sung, so it reads as an aside rather than as part of the line.
  if (segment.note) {
    return <span className="seg seg--note">{segment.text}</span>;
  }

  const chordText = segment.chord ? formatChord(segment.chord) : '';

  // Lyrics off, or a plain stretch of words: no chord column, just text that wraps normally.
  if (!showChords || !segment.chord) {
    return <span className="seg seg--plain">{renderText(segment.text)}</span>;
  }

  // A chord over empty text (an intro or turnaround) still needs a little width to sit in.
  const text = segment.text.length > 0 ? renderText(segment.text) : ' ';

  return (
    <span className="seg">
      <span className="seg__chord">{chordText}</span>
      <span className="seg__text">{text}</span>
    </span>
  );
}

/**
 * Preserves runs of spaces without `white-space: pre`, so the line can still wrap.
 *
 * A leading or internal double space in a lyric is meaningful spacing the writer put there; a
 * plain span would collapse it. Non-breaking spaces hold it without gluing the whole line into
 * one unwrappable unit.
 */
function renderText(text: string): string {
  return text.replace(/ {2,}/g, (run) => ' '.repeat(run.length));
}
