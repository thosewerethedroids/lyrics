/**
 * Turning an uploaded file or a pasted block into a plain matrix of cells.
 *
 * Everything downstream — column detection, the match planner — works on `string[][]`, so the
 * format the rows arrived in (xlsx, csv, tsv, or one-name-per-line paste) stops mattering here.
 * Row order is preserved exactly: row 1 of the sheet is row 1 of the matrix, which is page 1 of
 * the document. That guarantee is the whole reason imports exist, so nothing in this file sorts.
 */

import Papa from 'papaparse';

export type Matrix = string[][];

/** Drops rows that are entirely empty, and trims trailing empty cells off each row. */
function tidy(rows: unknown[][]): Matrix {
  return rows
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))))
    .map((row) => {
      let end = row.length;
      while (end > 0 && row[end - 1]!.trim() === '') end -= 1;
      return row.slice(0, end);
    })
    .filter((row) => row.some((cell) => cell.trim() !== ''));
}

/**
 * Parses delimited text — a pasted block or the text of a `.csv`/`.tsv`.
 *
 * PapaParse sniffs the delimiter, so a tab-separated paste and a comma-separated one both work
 * without the caller declaring which it is. A single column (one page name per line) is the
 * common iPad case and falls out of this for free.
 */
export function parseDelimited(text: string): Matrix {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    // Let Papa detect ',' vs '\t' vs ';'. A single-column paste has no delimiter and comes back
    // as one cell per row, which is exactly what we want.
  });
  return tidy(result.data);
}

/** Reads a spreadsheet file into a matrix, dispatching on its extension. */
export async function parseFile(file: File): Promise<Matrix> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    // SheetJS is loaded lazily: it is the single heaviest dependency, and a user who only ever
    // pastes names should never pay to download it.
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const book = XLSX.read(buffer, { type: 'array' });
    const first = book.SheetNames[0];
    if (!first) return [];
    const sheet = book.Sheets[first]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    return tidy(rows);
  }

  // Everything else is treated as delimited text: .csv, .tsv, .txt, or no extension at all.
  return parseDelimited(await file.text());
}
