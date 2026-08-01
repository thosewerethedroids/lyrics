import { useSync } from '../sync';
import type { Conflict } from '../../sync/engine';
import type { Doc, Page } from '../../db/types';

/**
 * The side-by-side chooser for a two-sided edit.
 *
 * Shown one conflict at a time, in the app shell, so it cannot be missed. Every path keeps data:
 * "keep both" is offered precisely so a real disagreement never forces the user to throw an edit
 * away. Nothing here resolves on its own — it waits for a choice.
 */
export function ConflictDialog() {
  const { conflicts, resolve } = useSync();
  const conflict = conflicts[0];
  if (!conflict) return null;

  return (
    <div className="scrim">
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="Resolve a sync conflict">
        <h2 className="dialog__title">This song changed in two places</h2>
        <p className="dialog__body">
          “{titleOf(conflict)}” was edited on this device and elsewhere since the last sync. Pick
          which to keep — or keep both, and nothing is lost.
          {conflicts.length > 1 ? ` ${conflicts.length - 1} more after this.` : ''}
        </p>

        <div className="conflict-cols">
          <Side heading="This device" record={conflict.local} kind={conflict.kind} />
          <Side heading="The other device" record={conflict.remote} kind={conflict.kind} />
        </div>

        <div className="dialog__actions conflict-actions">
          <button type="button" className="btn" onClick={() => void resolve(conflict, 'theirs')}>
            Keep theirs
          </button>
          <button type="button" className="btn" onClick={() => void resolve(conflict, 'both')}>
            Keep both
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void resolve(conflict, 'mine')}>
            Keep mine
          </button>
        </div>
      </div>
    </div>
  );
}

function titleOf(conflict: Conflict): string {
  return conflict.kind === 'page'
    ? (conflict.local as Page).title || (conflict.local as Page).song
    : (conflict.local as Doc).name;
}

function Side({
  heading,
  record,
  kind,
}: {
  heading: string;
  record: Page | Doc;
  kind: 'page' | 'doc';
}) {
  return (
    <div className="conflict-side">
      <div className="conflict-side__head">
        <span className="conflict-side__label">{heading}</span>
        <span className="conflict-side__time">{formatWhen(record.updatedAt)}</span>
      </div>
      {kind === 'page' ? (
        <PagePreview page={record as Page} />
      ) : (
        <DocPreview doc={record as Doc} />
      )}
    </div>
  );
}

function PagePreview({ page }: { page: Page }) {
  const snippet = page.lyrics.trim().split('\n').slice(0, 6).join('\n');
  return (
    <>
      <div className="conflict-side__meta">
        {page.deletedAt ? 'Deleted' : `${page.tags.length} tags`}
      </div>
      <pre className="conflict-side__body">{snippet || '(no lyrics)'}</pre>
    </>
  );
}

function DocPreview({ doc }: { doc: Doc }) {
  return (
    <div className="conflict-side__meta">
      {doc.deletedAt ? 'Deleted' : `${doc.pageIds.length} songs in this order`}
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
