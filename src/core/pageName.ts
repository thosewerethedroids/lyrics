/**
 * Splitting `"Song - Artist"` into its halves.
 *
 * That string is what gets typed into a spreadsheet, so it is also the join key for imports.
 * Getting the split right is most of what makes import matching work.
 */

export type PageName = {
  song: string;
  artist: string;
};

/** Spaced dashes, in the three forms iOS smart punctuation produces. */
const SPACED_SEPARATORS = [' - ', ' – ', ' — ', ' -- '];

/** A hyphen with a space on exactly one side: `"Song- Artist"`, `"Song -Artist"`. Typos. */
const HALF_SPACED = /(?:\s[-–—](?=\S)|(?<=\S)[-–—]\s)/g;

/**
 * Parses a page name.
 *
 * The separator is looked for from the **right**, because song titles contain dashes far more
 * often than artist names do: `"Marquee Moon - Live - Television"` is the Television song, not
 * a song called "Marquee Moon" by "Live - Television".
 *
 * A *bare* hyphen is deliberately not treated as a separator. `"Man-Sized Wreath - The
 * Decemberists"` splits on the spaced dash and keeps its hyphen; but `"Man-Sized Wreath"` on its
 * own must stay whole, and no rule can tell those apart from the hyphen alone. When an import row
 * has no spaced separator and finds no match, the planner retries it with
 * {@link alternateBareHyphenParses} rather than guessing here — a miss becomes a question, never
 * a silently mangled title.
 */
export function parsePageName(raw: string): PageName {
  const text = raw.trim();
  if (!text) return { song: '', artist: '' };

  let cut = -1;
  let cutLength = 0;
  for (const separator of SPACED_SEPARATORS) {
    const at = text.lastIndexOf(separator);
    if (at > cut) {
      cut = at;
      cutLength = separator.length;
    }
  }

  if (cut < 0) {
    // Fall back to a one-sided hyphen, which is unambiguous enough to act on: a hyphen inside a
    // compound word ("Man-Sized") never has a space on one side only.
    const matches = [...text.matchAll(HALF_SPACED)];
    const last = matches[matches.length - 1];
    if (last && last.index !== undefined) {
      cut = last.index;
      cutLength = last[0].length;
    }
  }

  if (cut < 0) return { song: text, artist: '' };

  const song = text.slice(0, cut).trim();
  const artist = text.slice(cut + cutLength).trim();

  // A separator at either end leaves nothing on one side; treat the whole string as the song.
  if (!song || !artist) return { song: text, artist: '' };
  return { song, artist };
}

/**
 * Every way a bare hyphen could split this string, longest song first.
 *
 * Used only as a last resort during import, to offer `"Ring of Fire-Johnny Cash"` as a near match
 * for an existing page rather than creating a stub with the artist buried in the title.
 */
export function alternateBareHyphenParses(raw: string): PageName[] {
  const text = raw.trim();
  const out: PageName[] = [];
  for (let i = text.length - 1; i > 0; i -= 1) {
    const ch = text[i];
    if (ch !== '-' && ch !== '–' && ch !== '—') continue;
    const song = text.slice(0, i).trim();
    const artist = text.slice(i + 1).trim();
    if (song && artist) out.push({ song, artist });
  }
  return out;
}

/** The canonical display form, and what `Page.title` is kept equal to. */
export function displayTitle(name: PageName): string {
  return name.artist ? `${name.song} - ${name.artist}` : name.song;
}
