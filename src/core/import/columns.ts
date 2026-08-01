/**
 * Working out what the columns of an imported matrix mean.
 *
 * A sheet can arrive in three shapes: a single `Song - Artist` column, separate `song` and
 * `artist` columns, or either of those plus a comma-separated `tags` column. When there is a
 * header row the shape is read from it; when there is not, a best guess is offered and the UI
 * lets the user correct it before anything is committed — a wrong guess must never become pages.
 */

import { parsePageName } from '../pageName';
import { normaliseTags } from '../../db/pages';
import type { Matrix } from './spreadsheet';

export type ColumnRole = 'name' | 'song' | 'artist' | 'tags' | 'ignore';

export type ColumnMapping = {
  roles: ColumnRole[];
  /** Whether row 0 of the matrix is a header and should be skipped when building rows. */
  hasHeader: boolean;
};

const HEADER_WORDS: Record<string, ColumnRole> = {
  name: 'name',
  title: 'name',
  song: 'song',
  songs: 'song',
  track: 'song',
  tune: 'song',
  artist: 'artist',
  band: 'artist',
  by: 'artist',
  performer: 'artist',
  tag: 'tags',
  tags: 'tags',
  labels: 'tags',
};

function headerRole(cell: string): ColumnRole | undefined {
  return HEADER_WORDS[cell.trim().toLowerCase()];
}

/** True when the first row reads like column headings rather than data. */
function looksLikeHeader(first: string[]): boolean {
  const known = first.filter((cell) => headerRole(cell) !== undefined).length;
  // One recognised heading among a short row, or a clear majority, is enough to call it a header.
  return known > 0 && (first.length <= 3 ? known >= 1 : known >= Math.ceil(first.length / 2));
}

/**
 * Detects the column mapping for a matrix.
 *
 * With a header, each column takes the role its heading names. Without one, a single column is a
 * combined `name` column, and the first two columns of a wider sheet are guessed as song then
 * artist — the arrangement a person scanning the sheet would assume, and one the UI surfaces for
 * confirmation rather than acting on blind.
 */
export function detectMapping(matrix: Matrix): ColumnMapping {
  const first = matrix[0] ?? [];
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);

  if (first.length > 0 && looksLikeHeader(first)) {
    const roles: ColumnRole[] = [];
    for (let i = 0; i < width; i += 1) {
      roles[i] = headerRole(first[i] ?? '') ?? 'ignore';
    }
    // A header with a lone recognised column that is neither song nor artist still needs a name
    // source; fall back to treating the first column as the combined name.
    if (!roles.includes('name') && !roles.includes('song')) roles[0] = 'name';
    return { roles, hasHeader: true };
  }

  if (width <= 1) return { roles: ['name'], hasHeader: false };

  const roles: ColumnRole[] = new Array(width).fill('ignore');
  roles[0] = 'song';
  roles[1] = 'artist';
  return { roles, hasHeader: false };
}

export type RowInput = {
  /** 0-based position in the sheet, and therefore in the resulting document. */
  index: number;
  song: string;
  artist: string;
  tags: string[];
  /** The original combined string, kept so the planner can retry a bare-hyphen split on a miss. */
  raw: string;
};

/** Builds the ordered rows to plan, applying a mapping and skipping the header if there is one. */
export function rowsFromMatrix(matrix: Matrix, mapping: ColumnMapping): RowInput[] {
  const body = mapping.hasHeader ? matrix.slice(1) : matrix;
  const nameCol = mapping.roles.indexOf('name');
  const songCol = mapping.roles.indexOf('song');
  const artistCol = mapping.roles.indexOf('artist');
  const tagCols = mapping.roles
    .map((role, i) => (role === 'tags' ? i : -1))
    .filter((i) => i >= 0);

  const out: RowInput[] = [];
  for (const row of body) {
    const tags = normaliseTags(
      tagCols.flatMap((col) => (row[col] ?? '').split(/[,;]/).map((t) => t.trim())),
    );

    let song = '';
    let artist = '';
    let raw = '';

    if (nameCol >= 0) {
      raw = (row[nameCol] ?? '').trim();
      const parsed = parsePageName(raw);
      song = parsed.song;
      artist = parsed.artist;
    } else {
      song = (row[songCol] ?? '').trim();
      artist = (row[artistCol] ?? '').trim();
      raw = artist ? `${song} - ${artist}` : song;
    }

    if (!song && !raw) continue;
    out.push({ index: out.length, song, artist, tags, raw });
  }
  return out;
}
