import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Doc, Page } from '../../db/types';
import {
  createPage,
  deletePage,
  documentsContaining,
  restorePage,
  tagCounts,
  updatePage,
} from '../../db/pages';
import { displayTitle } from '../../core/pageName';
import { parseChordChart, transposeBody } from '../../core/chordSheet';
import { goBack, navigate } from '../router';
import { Dialog } from '../components/Dialog';
import { TagInput } from '../components/TagInput';
import { ChordSheet } from '../components/ChordSheet';
import { TransposeBar } from '../components/TransposeBar';
import { useToast } from '../components/Toast';

type Draft = {
  song: string;
  artist: string;
  lyrics: string;
  notes: string;
  tags: string[];
};

type Mode = 'read' | 'edit';

const EMPTY: Draft = { song: '', artist: '', lyrics: '', notes: '', tags: [] };

const AUTOSAVE_MS = 700;

export function PageEditorView({ id }: { id?: string }) {
  const existing = useLiveQuery(() => (id ? db.pages.get(id) : undefined), [id], undefined);
  const suggestions = useLiveQuery(async () => (await tagCounts()).map((t) => t.tag), [], []);
  const toast = useToast();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<'clean' | 'saving' | 'saved'>('clean');
  const [confirmDelete, setConfirmDelete] = useState<Doc[] | null>(null);

  // A new song opens in the editor; an existing one opens ready to read on stage.
  const [mode, setMode] = useState<Mode>(id ? 'read' : 'edit');
  const [showChords, setShowChords] = useState(true);

  // Transposition lives on the record, not in this view: it is a fact about the song ("I play
  // this a step down"), so it has to survive leaving the page and match what performance shows.
  const transpose = existing?.transpose ?? 0;
  const setTranspose = (semitones: number) => {
    if (editingId.current) void updatePage(editingId.current, { transpose: semitones });
  };

  const editingId = useRef<string | undefined>(id);
  const loadedFor = useRef<string | undefined>(undefined);
  const dirty = useRef(false);

  // Load once per record, so a background write (sync, another tab) never stomps on typing.
  useEffect(() => {
    if (!id) {
      if (loadedFor.current !== 'new') {
        loadedFor.current = 'new';
        editingId.current = undefined;
        dirty.current = false;
        setDraft(EMPTY);
        setMode('edit');
      }
      return;
    }
    if (!existing || loadedFor.current === id) return;
    loadedFor.current = id;
    editingId.current = id;
    dirty.current = false;
    setDraft({
      song: existing.song,
      artist: existing.artist,
      lyrics: existing.lyrics,
      notes: existing.notes ?? '',
      tags: existing.tags,
    });
    // A stub with no lyrics is opened to be filled in, not read.
    setMode(existing.lyrics.trim() ? 'read' : 'edit');
  }, [id, existing]);

  // Autosave on a debounce — there is no natural "save" moment mid-set on a phone.
  useEffect(() => {
    if (!dirty.current) return;
    if (!draft.song.trim() && !draft.lyrics.trim()) return;

    setStatus('saving');
    const timer = window.setTimeout(async () => {
      if (editingId.current) {
        await updatePage(editingId.current, draft);
      } else {
        const created = await createPage(draft);
        editingId.current = created.id;
        loadedFor.current = created.id;
        navigate({ name: 'page', id: created.id }, true);
      }
      setStatus('saved');
    }, AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [draft]);

  // Flush a pending edit if the tab is closed inside the debounce window.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || !editingId.current) return;
      void updatePage(editingId.current, draft);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [draft]);

  function edit(patch: Partial<Draft>) {
    dirty.current = true;
    setDraft((current) => ({ ...current, ...patch }));
  }

  const title = useMemo(
    () => displayTitle({ song: draft.song.trim(), artist: draft.artist.trim() }),
    [draft.song, draft.artist],
  );

  const hasChords = useMemo(() => parseChordChart(draft.lyrics).hasChords, [draft.lyrics]);

  if (id && existing === undefined && loadedFor.current !== id) {
    return <div className="view" />;
  }
  if (id && existing === null) {
    return (
      <div className="view">
        <p className="empty__title">That song is no longer in the library.</p>
      </div>
    );
  }

  /**
   * Rewrites the stored lyrics into the transposed key, making the change permanent.
   *
   * The saved offset is cleared in the same write: once the shift is in the text, leaving it on
   * the record too would apply it a second time and the song would drift a step every visit.
   */
  async function bakeTranspose() {
    if (!editingId.current || transpose === 0) return;
    const rewritten = transposeBody(draft.lyrics, transpose);
    const previous = draft.lyrics;
    const shift = transpose;
    edit({ lyrics: rewritten });
    await updatePage(editingId.current, { lyrics: rewritten, transpose: 0 });
    toast.show('Saved in the new key.', {
      label: 'Undo',
      run: () => {
        // Restore both halves together, or the song comes back in the old key still carrying the
        // offset that produced the new one.
        edit({ lyrics: previous });
        if (editingId.current) {
          void updatePage(editingId.current, { lyrics: previous, transpose: shift });
        }
      },
    });
  }

  return (
    <div className="view">
      <header className="view__header view__header--stacked">
        <button type="button" className="view__back" onClick={() => goBack({ name: 'library' })}>
          ← Library
        </button>
        <div className="view__headline">
          <h1 className="view__title">{draft.song.trim() || (id ? 'Untitled' : 'New song')}</h1>
          {mode === 'edit' ? (
            <span className="view__count" aria-live="polite">
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Saves as you type'}
            </span>
          ) : null}
        </div>
        {draft.artist.trim() ? <p className="view__subtitle">{draft.artist}</p> : null}
      </header>

      {editingId.current ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="mode-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className="mode-toggle__option"
              aria-pressed={mode === 'read'}
              onClick={() => setMode('read')}
            >
              Read
            </button>
            <button
              type="button"
              className="mode-toggle__option"
              aria-pressed={mode === 'edit'}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'read' ? (
        <ReadMode
          draft={draft}
          transpose={transpose}
          showChords={showChords}
          hasChords={hasChords}
          onTranspose={setTranspose}
          onToggleChords={setShowChords}
          onBake={bakeTranspose}
        />
      ) : (
        <EditMode
          draft={draft}
          title={title}
          suggestions={suggestions ?? []}
          isNew={!id}
          canDelete={Boolean(editingId.current)}
          onEdit={edit}
          onDone={() => (id ? setMode('read') : goBack({ name: 'library' }))}
          onDelete={async () =>
            setConfirmDelete(await documentsContaining(editingId.current as string))
          }
        />
      )}

      {confirmDelete ? (
        <DeleteDialog
          page={existing as Page}
          documents={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function ReadMode({
  draft,
  transpose,
  showChords,
  hasChords,
  onTranspose,
  onToggleChords,
  onBake,
}: {
  draft: Draft;
  transpose: number;
  showChords: boolean;
  hasChords: boolean;
  onTranspose: (semitones: number) => void;
  onToggleChords: (show: boolean) => void;
  onBake: () => void;
}) {
  if (!draft.lyrics.trim()) {
    return (
      <div className="empty">
        <p className="empty__title">No lyrics yet.</p>
        <p>Switch to Edit to add them.</p>
      </div>
    );
  }

  return (
    <div className="reader">
      {hasChords ? (
        <TransposeBar
          body={draft.lyrics}
          semitones={transpose}
          onChange={onTranspose}
          showChords={showChords}
          onToggleChords={onToggleChords}
        />
      ) : null}

      {draft.notes.trim() ? <p className="reader__notes">{draft.notes}</p> : null}

      <ChordSheet body={draft.lyrics} transpose={transpose} showChords={showChords} />

      {transpose !== 0 ? (
        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          <button type="button" className="btn btn--small" onClick={onBake}>
            Save lyrics in this key
          </button>
          <span className="settings-section__note">Rewrites the stored chords permanently.</span>
        </div>
      ) : null}

      {draft.tags.length > 0 ? (
        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          {draft.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditMode({
  draft,
  title,
  suggestions,
  isNew,
  canDelete,
  onEdit,
  onDone,
  onDelete,
}: {
  draft: Draft;
  title: string;
  suggestions: string[];
  isNew: boolean;
  canDelete: boolean;
  onEdit: (patch: Partial<Draft>) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  return (
    <form className="editor" onSubmit={(event) => event.preventDefault()}>
      <div className="editor__pair">
        <div>
          <label className="label" htmlFor="song">
            Song
          </label>
          <input
            id="song"
            className="field"
            value={draft.song}
            onChange={(event) => onEdit({ song: event.target.value })}
            autoCapitalize="words"
            autoFocus={isNew}
          />
        </div>
        <div>
          <label className="label" htmlFor="artist">
            Artist
          </label>
          <input
            id="artist"
            className="field"
            value={draft.artist}
            onChange={(event) => onEdit({ artist: event.target.value })}
            autoCapitalize="words"
          />
        </div>
      </div>

      {title ? (
        <p className="editor__derived">
          Spreadsheets match this page as <strong>{title}</strong>
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="lyrics">
          Lyrics &amp; chords
        </label>
        <textarea
          id="lyrics"
          className="field field--area editor__lyrics"
          value={draft.lyrics}
          onChange={(event) => onEdit({ lyrics: event.target.value })}
          spellCheck={false}
          autoCapitalize="sentences"
          placeholder={
            '[G]Chords go in square brackets\n' +
            '{Chorus 2x} — curly braces are notes to yourself\n' +
            '(parentheses) stay as plain lyrics'
          }
        />
        <p className="editor__derived">
          <strong>[G]</strong> is a chord · <strong>{'{Chorus 2x}'}</strong> is a note to yourself ·{' '}
          <strong>(parentheses)</strong> stay as lyrics. Chords on their own line above the words
          work too. Switch to Read to see the chart and transpose.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <input
          id="notes"
          className="field"
          value={draft.notes}
          onChange={(event) => onEdit({ notes: event.target.value })}
          placeholder="Key, capo, tuning, cues"
        />
      </div>

      <TagInput value={draft.tags} suggestions={suggestions} onChange={(tags) => onEdit({ tags })} />

      <footer className="editor__footer">
        <button type="button" className="btn btn--primary" onClick={onDone}>
          Done
        </button>
        <span className="spacer" />
        {canDelete ? (
          <button type="button" className="btn btn--danger" onClick={onDelete}>
            Delete from library
          </button>
        ) : null}
      </footer>
    </form>
  );
}

function DeleteDialog({
  page,
  documents,
  onCancel,
}: {
  page: Page;
  documents: Doc[];
  onCancel: () => void;
}) {
  const toast = useToast();

  return (
    <Dialog
      title={`Delete “${page.song || 'Untitled'}”?`}
      confirmLabel="Delete"
      confirmTone="danger"
      onCancel={onCancel}
      onConfirm={async () => {
        await deletePage(page.id);
        onCancel();
        navigate({ name: 'library' }, true);
        toast.show('Song deleted.', {
          label: 'Undo',
          run: () => void restorePage(page.id),
        });
      }}
    >
      {documents.length === 0 ? (
        <p>This song is not in any document. It will be removed from the library.</p>
      ) : (
        <>
          <p>
            It will also be removed from {documents.length}{' '}
            {documents.length === 1 ? 'document' : 'documents'}:
          </p>
          <ul className="dialog__list">
            {documents.map((doc) => (
              <li key={doc.id}>{doc.name}</li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
