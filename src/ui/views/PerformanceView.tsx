import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Page } from '../../db/types';
import { updatePage } from '../../db/pages';
import { firstChordOf } from '../../core/chordSheet';
import { formatChord, prefersFlats, transposeChord } from '../../core/chords';
import { navigate } from '../router';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, usePrefs } from '../prefs';
import { useWakeLock } from '../useWakeLock';
import { useFitToBox } from '../useFitToBox';
import { ChordSheet } from '../components/ChordSheet';
import { tick } from '../haptics';

/**
 * Full-screen, no chrome, screen kept awake. The whole point of the app.
 *
 * Paging is deliberate: explicit arrows, the arrow keys, and Page Up / Page Down — that last pair
 * is what a Bluetooth foot pedal sends, so a pedal works with no pairing step. There are no
 * tap-anywhere zones; a stray touch while turning a page or steadying the iPad should never lose
 * your place mid-song.
 */
export function PerformanceView({ docId, index }: { docId: string; index: number }) {
  const { prefs, set } = usePrefs();
  const [controlsOpen, setControlsOpen] = useState(false);

  const doc = useLiveQuery(() => db.documents.get(docId), [docId], undefined);
  const pagesById = useLiveQuery(async () => {
    const all = await db.pages.toArray();
    const map = new Map<string, Page>();
    for (const page of all) map.set(page.id, page);
    return map;
  }, [], undefined);

  useWakeLock(true);

  const pageIds = doc?.pageIds ?? [];
  const count = pageIds.length;
  const clamped = Math.max(0, Math.min(index, Math.max(0, count - 1)));
  const currentId = pageIds[clamped];
  const page = currentId ? pagesById?.get(currentId) : undefined;

  const transpose = page?.transpose ?? 0;

  // Keep the URL honest so reload and the back button land on the same song, but never push
  // history — paging through 17 songs should not mean 17 taps of Back to leave.
  const go = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(next, count - 1));
      if (target === clamped) return;
      tick(6);
      navigate({ name: 'perform', docId, index: target }, true);
    },
    [count, clamped, docId],
  );

  const exit = useCallback(() => {
    navigate({ name: 'document', id: docId }, true);
  }, [docId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          go(clamped + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          go(clamped - 1);
          break;
        case 'Home':
          event.preventDefault();
          go(0);
          break;
        case 'End':
          event.preventDefault();
          go(count - 1);
          break;
        case 'Escape':
          event.preventDefault();
          exit();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, exit, clamped, count]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Two columns only where there is genuinely room for them; a phone in portrait gets one, since
  // two columns of six words each is worse than one of twelve.
  const columns = prefs.columns === 'auto' ? (width >= 700 ? 2 : 1) : prefs.columns;

  // The ceiling is a comfortable reading size, not the biggest thing that would technically fit —
  // a four-line song stretched to fill an iPad is unreadable in a different way from too-small.
  const fitted = useFitToBox(sheetRef, {
    enabled: prefs.autoFit,
    min: FONT_SIZE_MIN,
    max: 48,
    deps: [currentId, columns, transpose, controlsOpen, prefs.lyricFont, width],
  });

  const shownSize = prefs.autoFit ? fitted : prefs.fontSize;

  /** Nudging the size is an explicit choice, so it takes over from auto-fit. */
  function nudgeSize(delta: number) {
    const base = shownSize ?? prefs.fontSize;
    const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, base + delta));
    if (prefs.autoFit) set('autoFit', false);
    set('fontSize', next);
  }

  function nudgeTranspose(delta: number) {
    if (!page) return;
    const next = Math.max(-11, Math.min(11, transpose + delta));
    void updatePage(page.id, { transpose: next });
  }

  const keyLabel = useMemo(() => {
    if (!page) return null;
    const first = firstChordOf(page.lyrics);
    if (!first) return null;
    const bare = (chord: typeof first) =>
      formatChord({ ...chord, suffix: '', bass: undefined, bassAccidental: undefined });
    if (transpose === 0) return bare(first);
    return bare(transposeChord(first, transpose, prefersFlats(first, transpose)));
  }, [page, transpose]);

  if (doc === undefined || pagesById === undefined) {
    return <div className="stage" />;
  }
  if (doc === null || count === 0) {
    return (
      <div className="stage stage--empty">
        <p>{doc === null ? 'That document no longer exists.' : 'This document has no songs.'}</p>
        <button type="button" className="btn" onClick={exit}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="stage">
      <header className="stage__head">
        <div className="stage__ident">
          <h1 className="stage__song-title">{page?.song ?? 'Untitled'}</h1>
          {page?.artist ? <p className="stage__artist">{page.artist}</p> : null}
        </div>
        <div className="stage__head-right">
          {keyLabel ? (
            <span className="stage__key">
              {keyLabel}
              {transpose !== 0 ? <span className="stage__key-shift"> ({transpose > 0 ? '+' : ''}{transpose})</span> : null}
            </span>
          ) : null}
          <span className="stage__position">
            {clamped + 1} of {count}
          </span>
        </div>
      </header>

      <div className="stage__body">
        <PageArrow
          direction="prev"
          disabled={clamped === 0}
          onClick={() => go(clamped - 1)}
        />

        <div
          ref={sheetRef}
          // Auto-fit measures against a fixed box, so overflow is impossible by construction.
          // A hand-picked size can overrun, and then the song has to stay reachable by scrolling.
          className={`stage__sheet${prefs.autoFit ? ' stage__sheet--fit' : ' stage__sheet--scroll'}`}
          style={shownSize ? { ['--chart-size' as string]: `${shownSize}px` } : undefined}
        >
          {/*
            The columns live on an inner element so the scroll container is never the multicol
            box itself. A multicol with a fixed height does not grow downward when it runs out of
            room — it fragments sideways into overflow columns — which would turn a long song in
            one column into a horizontal scroll. Only ask for columns when there are two.
          */}
          <div
            className="stage__cols"
            style={columns > 1 ? { columnCount: columns } : undefined}
          >
            {page ? (
              <ChordSheet body={page.lyrics} transpose={transpose} showChords />
            ) : (
              <p className="stage__missing">This song is no longer in the library.</p>
            )}
          </div>
        </div>

        <PageArrow
          direction="next"
          disabled={clamped === count - 1}
          onClick={() => go(clamped + 1)}
        />
      </div>

      {controlsOpen ? (
        <div className="stage__controls">
          <button type="button" className="btn" onClick={exit}>
            Done
          </button>

          <div className="stage__control-group">
            <span className="stage__control-label">Text</span>
            <div className="stepper">
              <button
                type="button"
                className="stepper__btn"
                aria-label="Smaller text"
                onClick={() => nudgeSize(-2)}
              >
                A−
              </button>
              <span className="stepper__value">{shownSize ?? '—'}</span>
              <button
                type="button"
                className="stepper__btn"
                aria-label="Larger text"
                onClick={() => nudgeSize(2)}
              >
                A+
              </button>
            </div>
            <button
              type="button"
              className={`btn btn--small${prefs.autoFit ? ' btn--on' : ''}`}
              aria-pressed={prefs.autoFit}
              onClick={() => set('autoFit', !prefs.autoFit)}
              title="Size the text so the whole song fits the screen"
            >
              Fit
            </button>
          </div>

          <div className="stage__control-group">
            <span className="stage__control-label">Key</span>
            <div className="stepper">
              <button
                type="button"
                className="stepper__btn"
                aria-label="Transpose down a semitone"
                onClick={() => nudgeTranspose(-1)}
                disabled={!keyLabel}
              >
                −
              </button>
              <span className="stepper__value">{keyLabel ?? '—'}</span>
              <button
                type="button"
                className="stepper__btn"
                aria-label="Transpose up a semitone"
                onClick={() => nudgeTranspose(1)}
                disabled={!keyLabel}
              >
                +
              </button>
            </div>
            {transpose !== 0 ? (
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={() => page && void updatePage(page.id, { transpose: 0 })}
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="stage__control-group">
            <span className="stage__control-label">Columns</span>
            <div className="sort-group" role="group" aria-label="Columns">
              {([1, 2, 'auto'] as const).map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  className="sort-group__option"
                  aria-pressed={prefs.columns === option}
                  onClick={() => set('columns', option)}
                >
                  {option === 'auto' ? 'Auto' : option}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="stage__controls-toggle"
        aria-expanded={controlsOpen}
        onClick={() => setControlsOpen((open) => !open)}
      >
        {controlsOpen ? 'Hide controls' : 'Controls'}
      </button>
    </div>
  );
}

/**
 * A page-turn arrow.
 *
 * Big, fixed, and at the outer edges — the two places a thumb already rests when an iPad is held,
 * and far from where anyone reaches to steady the screen.
 */
function PageArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`stage__arrow stage__arrow--${direction}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Previous song' : 'Next song'}
    >
      <span aria-hidden="true">{direction === 'prev' ? '‹' : '›'}</span>
    </button>
  );
}
