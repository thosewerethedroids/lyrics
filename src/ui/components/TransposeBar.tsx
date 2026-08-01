import { firstChordOf } from '../../core/chordSheet';
import { formatChord, transposeChord, prefersFlats } from '../../core/chords';

type Props = {
  body: string;
  semitones: number;
  onChange: (semitones: number) => void;
  showChords: boolean;
  onToggleChords: (show: boolean) => void;
};

const LIMIT = 11;

/**
 * The at-a-glance key readout plus a stepper.
 *
 * Showing the resulting key ("G → A") matters more than the semitone count — a player thinks in
 * keys, not intervals. The count is there too because a capo instruction is given in frets, which
 * are semitones.
 */
export function TransposeBar({ body, semitones, onChange, showChords, onToggleChords }: Props) {
  const first = firstChordOf(body);
  const originalKey = first ? formatChord({ ...first, suffix: '', bass: undefined }) : null;
  const newKey =
    first && semitones !== 0
      ? formatChord({
          ...transposeChord(first, semitones, prefersFlats(first, semitones)),
          suffix: '',
          bass: undefined,
        })
      : originalKey;

  const clamp = (value: number) => Math.max(-LIMIT, Math.min(LIMIT, value));

  return (
    <div className="transpose-bar">
      <span className="transpose-bar__key">
        {originalKey ? (
          semitones === 0 ? (
            <>Key of {originalKey}</>
          ) : (
            <>
              {originalKey} → <strong>{newKey}</strong>
              {' · '}
              {semitones > 0 ? '+' : ''}
              {semitones}
            </>
          )
        ) : (
          'No chords'
        )}
      </span>

      <span className="spacer" />

      <div className="stepper" role="group" aria-label="Transpose">
        <button
          type="button"
          className="stepper__btn"
          aria-label="Transpose down a semitone"
          onClick={() => onChange(clamp(semitones - 1))}
          disabled={!originalKey}
        >
          −
        </button>
        <span className="stepper__value" aria-live="polite">
          {semitones > 0 ? '+' : ''}
          {semitones}
        </span>
        <button
          type="button"
          className="stepper__btn"
          aria-label="Transpose up a semitone"
          onClick={() => onChange(clamp(semitones + 1))}
          disabled={!originalKey}
        >
          +
        </button>
      </div>

      {semitones !== 0 ? (
        <button type="button" className="btn btn--small btn--quiet" onClick={() => onChange(0)}>
          Reset
        </button>
      ) : null}

      {originalKey ? (
        <button
          type="button"
          className="btn btn--small btn--quiet"
          aria-pressed={!showChords}
          onClick={() => onToggleChords(!showChords)}
        >
          {showChords ? 'Hide chords' : 'Show chords'}
        </button>
      ) : null}
    </div>
  );
}
