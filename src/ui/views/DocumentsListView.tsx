import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isLive } from '../../db/types';
import type { Doc } from '../../db/types';
import { createDoc } from '../../db/documents';
import { hrefFor, navigate } from '../router';

/** The shelf of binders. Each document is a setlist; tap one to open its running order. */
export function DocumentsListView() {
  const docs = useLiveQuery(async () => {
    const rows = (await db.documents.toArray()).filter(isLive);
    // Most-recently-touched first: the set you are building tonight sits at the top.
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [], undefined);

  if (!docs) return <div className="view" />;

  return (
    <div className="view">
      <header className="view__header">
        <h1 className="view__title">Documents</h1>
        <span className="view__count">
          {docs.length} {docs.length === 1 ? 'set' : 'sets'}
        </span>
      </header>

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            const doc = await createDoc('Untitled set');
            navigate({ name: 'document', id: doc.id });
          }}
        >
          New document
        </button>
        <a className="btn" href={hrefFor({ name: 'import' })}>
          Import spreadsheet
        </a>
      </div>

      {docs.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No documents yet.</p>
          <p>A document is an ordered set of songs. Build one by hand, or import a spreadsheet.</p>
        </div>
      ) : (
        <ul className="page-list">
          {docs.map((doc) => (
            <DocRow key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: Doc }) {
  const count = doc.pageIds.length;
  return (
    <li>
      <button
        type="button"
        className="page-row"
        aria-label={`${doc.name}, ${count} ${count === 1 ? 'song' : 'songs'}`}
        onClick={() => navigate({ name: 'document', id: doc.id })}
      >
        <span className="page-row__body">
          <span className="page-row__song">{doc.name}</span>
          <span className="page-row__meta">
            <span className="page-row__artist">
              {count} {count === 1 ? 'song' : 'songs'}
            </span>
          </span>
        </span>
        <span className="page-row__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}
