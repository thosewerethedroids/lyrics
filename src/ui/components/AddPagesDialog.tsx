import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isLive } from '../../db/types';
import type { Page } from '../../db/types';
import { createPage } from '../../db/pages';
import { matchesQuery, sortPages } from '../search';

type Props = {
  /** Page ids already in the document, shown as a hint — adding again makes a reprise. */
  present: string[];
  onAdd: (pageIds: string[]) => void;
  onClose: () => void;
};

/**
 * Picks songs from the library to append to a document.
 *
 * A song already in the set is not hidden or disabled — adding it again is how a reprise is built,
 * which the spec calls out as a real setlist move. It is only marked, so the choice is deliberate.
 * A song the library does not have yet can be created inline without leaving the set you are
 * assembling.
 */
export function AddPagesDialog({ present, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const pages = useLiveQuery(async () => (await db.pages.toArray()).filter(isLive), [], undefined);

  const presentSet = useMemo(() => new Set(present), [present]);

  const visible = useMemo(() => {
    if (!pages) return [];
    return sortPages(
      pages.filter((page) => matchesQuery(page, query)),
      'title',
    );
  }, [pages, query]);

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  const trimmed = query.trim();
  const exactExists =
    pages?.some((page) => page.title.toLowerCase() === trimmed.toLowerCase()) ?? false;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog--tall" role="dialog" aria-modal="true" aria-label="Add songs">
        <h2 className="dialog__title">Add songs</h2>

        <input
          className="field"
          type="search"
          placeholder="Search the library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          aria-label="Search the library"
        />

        <ul className="pick-list">
          {trimmed && !exactExists ? (
            <li>
              <button
                type="button"
                className="pick-row pick-row--create"
                onClick={async () => {
                  const page = await createPage({ song: trimmed });
                  onAdd([page.id]);
                }}
              >
                <span className="pick-row__check" aria-hidden="true">
                  +
                </span>
                <span className="pick-row__body">
                  <span className="doc-row__song">Create “{trimmed}”</span>
                  <span className="doc-row__meta">New stub song, add it now</span>
                </span>
              </button>
            </li>
          ) : null}

          {visible.map((page) => (
            <PickRow
              key={page.id}
              page={page}
              checked={picked.includes(page.id)}
              alreadyIn={presentSet.has(page.id)}
              onToggle={() => toggle(page.id)}
            />
          ))}

          {visible.length === 0 && !trimmed ? (
            <li className="pick-empty">The library is empty. Type a name to create a song.</li>
          ) : null}
        </ul>

        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={picked.length === 0}
            onClick={() => onAdd(picked)}
          >
            {picked.length === 0
              ? 'Add songs'
              : `Add ${picked.length} ${picked.length === 1 ? 'song' : 'songs'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickRow({
  page,
  checked,
  alreadyIn,
  onToggle,
}: {
  page: Page;
  checked: boolean;
  alreadyIn: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`pick-row${checked ? ' pick-row--checked' : ''}`}
        aria-pressed={checked}
        onClick={onToggle}
      >
        <span className="pick-row__check" aria-hidden="true">
          {checked ? '✓' : ''}
        </span>
        <span className="pick-row__body">
          <span className="doc-row__song">{page.song || 'Untitled'}</span>
          <span className="doc-row__meta">
            <span className="doc-row__artist">{page.artist || 'No artist'}</span>
            {alreadyIn ? <span className="chip">Already in set</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}
