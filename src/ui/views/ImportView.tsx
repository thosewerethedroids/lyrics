import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isLive } from '../../db/types';
import { goBack, navigate } from '../router';
import { useToast } from '../components/Toast';
import { parseDelimited, parseFile } from '../../core/import/spreadsheet';
import type { Matrix } from '../../core/import/spreadsheet';
import { detectMapping, rowsFromMatrix } from '../../core/import/columns';
import type { ColumnMapping, ColumnRole } from '../../core/import/columns';
import { planImport } from '../../core/import/planner';
import type { PlanRow } from '../../core/import/planner';
import { commitImport, applyImportedTags } from '../../db/import';
import type { ResolvedRow, ImportDestination } from '../../db/import';

/** Sentinel choice meaning "create a new song for this row". */
const NEW_SONG = '__new__';
/** Sentinel choice meaning "leave this row out — don't add or create anything". */
const SKIP = '__skip__';

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'name', label: 'Song - Artist' },
  { value: 'song', label: 'Song' },
  { value: 'artist', label: 'Artist' },
  { value: 'tags', label: 'Tags' },
  { value: 'ignore', label: 'Ignore' },
];

/**
 * Turn a spreadsheet — uploaded or pasted — into an ordered document.
 *
 * The screen never commits on a guess: the detected column mapping is editable, every near match
 * is shown for the user to accept or reject, and names that match nothing are surfaced as stubs
 * rather than dropped. Row order is carried straight through to the document's running order.
 */
export function ImportView() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [paste, setPaste] = useState('');
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [error, setError] = useState('');

  // Which existing song each uncertain row attaches to, or NEW_SONG to make a stub. Keyed by row
  // index; an absent entry means "use the planner's default candidate".
  const [overrides, setOverrides] = useState<Map<number, string>>(new Map());
  const [dest, setDest] = useState<'new' | 'existing'>('new');
  const [docName, setDocName] = useState('');
  const [existingId, setExistingId] = useState('');
  const [busy, setBusy] = useState(false);

  const pages = useLiveQuery(async () => (await db.pages.toArray()).filter(isLive), [], undefined);
  const docs = useLiveQuery(
    async () =>
      (await db.documents.toArray())
        .filter(isLive)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [],
    undefined,
  );

  const rows = useMemo(
    () => (matrix && mapping ? rowsFromMatrix(matrix, mapping) : []),
    [matrix, mapping],
  );
  const plan = useMemo(() => planImport(rows, pages ?? []), [rows, pages]);

  // The whole library, by title, so any uncertain row can be pointed at a song the matcher missed —
  // an import that just says "Athenry" can still be attached to "Fields of Athenry" by hand.
  const libraryByTitle = useMemo(
    () => (pages ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    [pages],
  );

  const width = matrix ? matrix.reduce((max, r) => Math.max(max, r.length), 0) : 0;

  function accept(matrix: Matrix, label: string) {
    if (matrix.length === 0) {
      setError('Nothing to import — the file or pasted text had no rows.');
      return;
    }
    setError('');
    setMatrix(matrix);
    setMapping(detectMapping(matrix));
    setSourceLabel(label);
    setOverrides(new Map());
    if (!docName) setDocName(label.replace(/\.[^.]+$/, '') || 'Imported set');
  }

  async function onFile(file: File) {
    try {
      accept(await parseFile(file), file.name);
    } catch {
      setError(`Could not read ${file.name}. Try exporting it as CSV or XLSX.`);
    }
  }

  function setRole(col: number, role: ColumnRole) {
    if (!mapping) return;
    const roles = [...mapping.roles];
    roles[col] = role;
    setMapping({ ...mapping, roles });
  }

  // The default before the user touches anything. An import never invents songs on its own: a row
  // that matches the library attaches to it, and a row that matches nothing defaults to SKIP so no
  // duplicate is ever created silently. Creating a new page is always an explicit opt-in.
  function defaultChoiceFor(row: PlanRow): string {
    if (row.kind === 'exact' || row.kind === 'near') return row.pageId ?? SKIP;
    return SKIP;
  }

  function choiceFor(row: PlanRow): string {
    return overrides.get(row.index) ?? defaultChoiceFor(row);
  }

  function setChoice(index: number, value: string) {
    setOverrides((current) => new Map(current).set(index, value));
  }

  // One picker for any uncertain row: its smart suggestions first, then the whole library to pick
  // from by hand, then create-new and skip. The full list is what lets a shorthand name be pointed
  // at the real song when the matcher didn't find it.
  function rowPicker(row: PlanRow) {
    const suggestedIds = new Set((row.candidates ?? []).map((c) => c.pageId));
    return (
      <select
        className="field import-pick__select"
        value={choiceFor(row)}
        onChange={(e) => setChoice(row.index, e.target.value)}
        aria-label={`Match for ${row.input.raw || row.input.song}`}
      >
        {row.candidates && row.candidates.length > 0 ? (
          <optgroup label="Suggested">
            {row.candidates.map((c) => (
              <option key={c.pageId} value={c.pageId}>
                {c.title}  ·  {reasonLabel(c.reason)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="All songs">
          {libraryByTitle
            .filter((p) => !suggestedIds.has(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </optgroup>
        <option value={NEW_SONG}>＋ Create new song</option>
        <option value={SKIP}>Skip — leave out</option>
      </select>
    );
  }

  // Only rows the user is actually keeping reach the commit; a skipped row is left out entirely,
  // so its order slot simply disappears from the resulting set.
  function resolvedRows(): ResolvedRow[] {
    return plan.rows
      .filter((row) => choiceFor(row) !== SKIP)
      .map((row) => {
        const choice = choiceFor(row);
        return { input: row.input, pageId: choice === NEW_SONG ? null : choice };
      });
  }

  async function commit() {
    const resolved = resolvedRows();
    if (resolved.length === 0) return;
    const destination: ImportDestination =
      dest === 'new'
        ? { kind: 'new', name: docName.trim() || 'Imported set' }
        : { kind: 'existing', id: existingId };
    if (dest === 'existing' && !existingId) {
      setError('Choose a document to apply this order to.');
      return;
    }

    setBusy(true);
    try {
      const result = await commitImport(resolved, destination);
      await applyImportedTags(resolved);
      const parts = [`${resolved.length} songs`];
      if (result.created > 0) parts.push(`${result.created} new`);
      toast.show(`Imported ${parts.join(', ')}.`);
      navigate({ name: 'document', id: result.docId });
    } catch {
      setError('Something went wrong writing the import. Nothing was changed.');
      setBusy(false);
    }
  }

  const nearRows = plan.rows.filter((r) => r.kind === 'near');
  const noneRows = plan.rows.filter((r) => r.kind === 'none');
  const inLibraryCount = plan.rows.filter((r) => {
    const c = choiceFor(r);
    return c !== SKIP && c !== NEW_SONG;
  }).length;
  const toCreateCount = plan.rows.filter((r) => choiceFor(r) === NEW_SONG).length;
  const skippedCount = plan.rows.filter((r) => choiceFor(r) === SKIP).length;
  const willAddCount = inLibraryCount + toCreateCount;

  function createAllNone(create: boolean) {
    setOverrides((current) => {
      const next = new Map(current);
      for (const r of noneRows) next.set(r.index, create ? NEW_SONG : SKIP);
      return next;
    });
  }

  return (
    <div className="view">
      <header className="view__header view__header--stacked">
        <button type="button" className="view__back" onClick={() => goBack({ name: 'documents' })}>
          ‹ Back
        </button>
        <h1 className="view__title">Import a spreadsheet</h1>
      </header>

      {error ? (
        <p className="import-error" role="alert">
          {error}
        </p>
      ) : null}

      {!matrix ? (
        <section className="import-source">
          <div className="settings-row">
            <span className="label">Paste rows</span>
            <p className="settings-section__note">
              One song per line, as <code>Song - Artist</code>. This is the quick path on an iPad.
            </p>
            <textarea
              className="field field--area"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Ring of Fire - Johnny Cash\nWagon Wheel - Old Crow Medicine Show'}
              aria-label="Paste rows, one song per line"
            />
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={paste.trim().length === 0}
                onClick={() => accept(parseDelimited(paste), 'Pasted list')}
              >
                Read pasted rows
              </button>
            </div>
          </div>

          <div className="settings-row">
            <span className="label">Or upload a file</span>
            <p className="settings-section__note">Accepts .csv, .tsv, and .xlsx. Row 1 is page 1.</p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = '';
              }}
            />
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                Choose file
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="import-map">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label" style={{ margin: 0 }}>
                {sourceLabel} · {rows.length} {rows.length === 1 ? 'row' : 'rows'}
              </span>
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={() => {
                  setMatrix(null);
                  setMapping(null);
                }}
              >
                Start over
              </button>
            </div>

            <div className="import-cols">
              {Array.from({ length: width }, (_, col) => (
                <label key={col} className="import-col">
                  <span className="import-col__sample">{matrix[0]?.[col] || `Column ${col + 1}`}</span>
                  <select
                    className="field"
                    value={mapping?.roles[col] ?? 'ignore'}
                    onChange={(e) => setRole(col, e.target.value as ColumnRole)}
                    aria-label={`Role for column ${col + 1}`}
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="import-header-toggle">
              <input
                type="checkbox"
                checked={mapping?.hasHeader ?? false}
                onChange={(e) => mapping && setMapping({ ...mapping, hasHeader: e.target.checked })}
              />
              First row is a header
            </label>
          </section>

          <section className="import-summary">
            <span className="import-stat">
              <strong>{inLibraryCount}</strong> in your library
            </span>
            {toCreateCount > 0 ? (
              <span className="import-stat import-stat--stub">
                <strong>{toCreateCount}</strong> to create
              </span>
            ) : null}
            <span className="import-stat">
              <strong>{skippedCount}</strong> skipped
            </span>
          </section>

          {nearRows.length > 0 ? (
            <section className="import-nears">
              <h2 className="settings-section__title">Which song did you mean?</h2>
              <p className="settings-section__note">
                These names weren’t an exact match. Pick the song each one should attach to — or
                create a new page, or leave it out.
              </p>
              <ul className="page-list">
                {nearRows.map((r) => (
                  <li key={r.index} className="import-pick">
                    <span className="import-pick__name doc-row__song">
                      {r.input.raw || r.input.song}
                    </span>
                    {rowPicker(r)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {noneRows.length > 0 ? (
            <section className="import-nears">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 className="settings-section__title" style={{ margin: 0 }}>
                  Not in your library
                </h2>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn--small btn--quiet"
                    onClick={() => createAllNone(true)}
                  >
                    Create all
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--quiet"
                    onClick={() => createAllNone(false)}
                  >
                    Skip all
                  </button>
                </span>
              </div>
              <p className="settings-section__note">
                These didn’t match automatically. If you already have the song under a fuller name,
                pick it from the list; otherwise create it or leave it out. Nothing is added unless
                you choose it, so no duplicates.
              </p>
              <ul className="page-list">
                {noneRows.map((r) => (
                  <li key={r.index} className="import-pick">
                    <span className="import-pick__name doc-row__song">
                      {r.input.raw || r.input.song}
                    </span>
                    {rowPicker(r)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="import-dest">
            <h2 className="settings-section__title">Where should these go?</h2>
            <div className="mode-toggle" role="group" aria-label="Destination">
              <button
                type="button"
                className="mode-toggle__option"
                aria-pressed={dest === 'new'}
                onClick={() => setDest('new')}
              >
                New document
              </button>
              <button
                type="button"
                className="mode-toggle__option"
                aria-pressed={dest === 'existing'}
                onClick={() => setDest('existing')}
              >
                Reorder existing
              </button>
            </div>

            {dest === 'new' ? (
              <input
                className="field"
                style={{ marginTop: 'var(--space-3)' }}
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document name"
                aria-label="New document name"
              />
            ) : (
              <>
                <select
                  className="field"
                  style={{ marginTop: 'var(--space-3)' }}
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                  aria-label="Document to reorder"
                >
                  <option value="">Choose a document…</option>
                  {(docs ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="settings-section__note">
                  This replaces that document's running order with the sheet's order.
                </p>
              </>
            )}
          </section>

          <div className="editor__footer">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || willAddCount === 0}
              onClick={() => void commit()}
            >
              {busy
                ? 'Importing…'
                : `Import ${willAddCount} ${willAddCount === 1 ? 'song' : 'songs'}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function reasonLabel(reason?: string): string {
  switch (reason) {
    case 'same-title':
      return 'same title';
    case 'article-or-suffix':
      return 'article/version';
    case 'hyphen':
      return 'dash split';
    case 'prefix':
      return 'partial title';
    case 'typo':
      return 'close spelling';
    default:
      return 'near';
  }
}
