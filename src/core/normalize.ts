/**
 * Turns a human-typed name into keys that can be compared.
 *
 * Two strengths, used as separate rungs of the import match ladder:
 *
 * - {@link tight} folds only what is unambiguously noise — case, diacritics, punctuation,
 *   whitespace runs. Two names with the same tight key are the same song, so a tight hit is
 *   applied automatically.
 * - {@link loose} additionally drops leading articles, trailing parentheticals (`(Live)`,
 *   `(Remastered 2011)`) and featured-artist clauses. That folds real information — `(Acoustic)`
 *   may genuinely be a different arrangement — so a loose hit is offered, never applied silently.
 */

import type { PageName } from './pageName';

const COMBINING_MARKS = /\p{M}+/gu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
const APOSTROPHES = /['’ʼ]/g;

/** Case, diacritic, punctuation and whitespace folding. Safe to auto-apply. */
export function tight(text: string): string {
  let s = text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

  // "Hall & Oates" and "Hall and Oates" should agree; "Rockin'" should match "Rockin".
  s = s.replace(/&/g, ' and ');
  s = s.replace(APOSTROPHES, '');

  return s.replace(NON_ALPHANUMERIC, ' ').trim().replace(/\s+/g, ' ');
}

const PARENTHETICAL = /\s*[([][^)\]]*[)\]]/g;
const TRAILING_QUALIFIER =
  /\s+-\s+(live|acoustic|demo|remaster(ed)?|radio edit|single version|mono|stereo)\b.*$/i;
const FEATURED = /\s+(feat\.?|ft\.?|featuring|with)\s+.*$/i;
const ARTICLES = ['the ', 'a ', 'an '];

/** Everything {@link tight} does, plus edits that discard real information. Suggest, never apply. */
export function loose(text: string): string {
  let working = text
    .replace(PARENTHETICAL, ' ')
    .replace(TRAILING_QUALIFIER, '')
    .replace(FEATURED, '');

  let key = tight(working);

  // Leading articles: "The Weight" / "Weight". Only stripped when something is left behind, so a
  // band actually called "The The" does not normalise away to nothing.
  for (const article of ARTICLES) {
    if (key.startsWith(article)) {
      const stripped = key.slice(article.length);
      if (stripped) key = stripped;
      break;
    }
  }

  return key;
}

/**
 * The stored match key for a whole page name.
 *
 * Persisted on each page and indexed, so matching an import row is a lookup rather than a scan
 * over the whole library.
 */
export function tightKey(name: PageName): string {
  return name.artist ? `${tight(name.song)}|${tight(name.artist)}` : tight(name.song);
}

/** The looser counterpart, computed on demand during an import. */
export function looseKey(name: PageName): string {
  return name.artist ? `${loose(name.song)}|${loose(name.artist)}` : loose(name.song);
}
