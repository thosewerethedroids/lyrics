import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSetting, setSetting } from '../db/settings';

/**
 * Per-device preferences.
 *
 * Deliberately *not* synced. Font size is a property of the screen you are looking at and the
 * distance you are standing from it — a size that works on the iPad on a music stand is wrong on
 * the phone in your hand, and syncing it would make every device fight the others.
 */

export type Theme = 'system' | 'dark' | 'light';
export type LyricFont = 'sans' | 'mono';

export type Prefs = {
  theme: Theme;
  /** Performance-view lyric size, in px. Only consulted when `autoFit` is off. */
  fontSize: number;
  /** Monospace keeps chord lines sitting over the syllable they belong to. */
  lyricFont: LyricFont;
  /**
   * Shrink the type until the whole song fits the screen, so no song needs scrolling.
   *
   * Touching the size stepper turns this off: an explicit size is a decision, and silently
   * overriding it on the next song would make the control feel broken.
   */
  autoFit: boolean;
  /** Columns in performance. `auto` means two whenever the screen is wide enough for them. */
  columns: 1 | 2 | 'auto';
};

const DEFAULTS: Prefs = {
  theme: 'system',
  fontSize: 16,
  lyricFont: 'sans',
  autoFit: true,
  columns: 'auto',
};

/** Small enough to cram a long song onto one screen when that is what you want. */
export const FONT_SIZE_MIN = 9;
export const FONT_SIZE_MAX = 72;

type PrefsContext = {
  prefs: Prefs;
  loaded: boolean;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
};

const Context = createContext<PrefsContext>({
  prefs: DEFAULTS,
  loaded: false,
  set: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getSetting<Partial<Prefs>>('prefs', {});
      if (cancelled) return;
      setPrefs({ ...DEFAULTS, ...stored });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback<PrefsContext['set']>((key, value) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      void setSetting('prefs', next);
      return next;
    });
  }, []);

  // The theme is an attribute on <html> rather than a class, so the CSS can express
  // "explicit choice wins over the media query" without any specificity tricks.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  // Wrapping is part of the same choice, not a separate setting. A chord chart must not reflow —
  // a wrapped line puts the chord over the wrong syllable, which is worse than scrolling for it.
  // Plain lyrics have no such constraint and should wrap to the screen.
  useEffect(() => {
    const root = document.documentElement;
    const mono = prefs.lyricFont === 'mono';
    root.style.setProperty('--font-lyrics', mono ? 'var(--font-mono)' : 'var(--font-ui)');
    root.style.setProperty('--lyrics-wrap', mono ? 'pre' : 'pre-wrap');
  }, [prefs.lyricFont]);

  const value = useMemo(() => ({ prefs, loaded, set }), [prefs, loaded, set]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePrefs(): PrefsContext {
  return useContext(Context);
}
