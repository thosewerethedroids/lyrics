import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteTag, renameTag, tagCounts } from '../../db/pages';
import { tight } from '../../core/normalize';
import type { TagCount } from '../../db/pages';
import { goBack } from '../router';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

/**
 * Tag housekeeping.
 *
 * The usage count is the whole point of this screen: a tag on one song sitting next to a nearly
 * identical one on forty is how a typo announces itself. Renaming onto an existing tag merges the
 * two rather than creating a duplicate, which is what makes fixing that typo a single action.
 */
export function TagsView() {
  const counts = useLiveQuery(() => tagCounts(), [], undefined);
  const [renaming, setRenaming] = useState<TagCount | null>(null);
  const [removing, setRemoving] = useState<TagCount | null>(null);

  if (!counts) return <div className="view" />;

  return (
    <div className="view">
      <header className="view__header view__header--stacked">
        <button type="button" className="view__back" onClick={() => goBack({ name: 'settings' })}>
          ← Settings
        </button>
        <div className="view__headline">
          <h1 className="view__title">Tags</h1>
          <span className="view__count">
            {counts.length} {counts.length === 1 ? 'tag' : 'tags'}
          </span>
        </div>
      </header>

      {counts.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No tags yet.</p>
          <p>Add tags to a song and they will show up here with their usage counts.</p>
        </div>
      ) : (
        <ul className="tag-list">
          {counts.map((entry) => (
            <li className="tag-row" key={entry.tag}>
              <span className="tag-row__name">{entry.tag}</span>
              <span className="tag-row__count">
                {entry.count} {entry.count === 1 ? 'song' : 'songs'}
              </span>
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={() => setRenaming(entry)}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn--small btn--danger"
                onClick={() => setRemoving(entry)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {renaming ? (
        <RenameTagDialog
          entry={renaming}
          existing={counts}
          onClose={() => setRenaming(null)}
        />
      ) : null}

      {removing ? (
        <Dialog
          title={`Remove the tag “${removing.tag}”?`}
          confirmLabel="Remove"
          confirmTone="danger"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const entry = removing;
            setRemoving(null);
            await deleteTag(entry.tag);
          }}
        >
          <p>
            It will be taken off {removing.count} {removing.count === 1 ? 'song' : 'songs'}. The
            songs themselves are not touched.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function RenameTagDialog({
  entry,
  existing,
  onClose,
}: {
  entry: TagCount;
  existing: TagCount[];
  onClose: () => void;
}) {
  const [name, setName] = useState(entry.tag);
  const toast = useToast();

  const target = name.trim();
  const collides =
    target.length > 0 &&
    tight(target) !== tight(entry.tag) &&
    existing.some((other) => tight(other.tag) === tight(target));

  async function commit() {
    if (!target) return;
    const changed = await renameTag(entry.tag, target);
    onClose();
    toast.show(
      collides
        ? `Merged into “${target}” across ${changed} ${changed === 1 ? 'song' : 'songs'}.`
        : `Renamed on ${changed} ${changed === 1 ? 'song' : 'songs'}.`,
    );
  }

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Rename tag">
        <h2 className="dialog__title">Rename “{entry.tag}”</h2>
        <p className="dialog__body">
          This changes the tag on all {entry.count} {entry.count === 1 ? 'song' : 'songs'} at once.
        </p>
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void commit()}
          autoFocus
          autoCapitalize="none"
          aria-label="New tag name"
        />
        {collides ? (
          <p className="settings-section__note">
            “{target}” already exists — the two will be merged into one tag.
          </p>
        ) : null}
        <div className="dialog__actions" style={{ marginTop: 'var(--space-4)' }}>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!target}
            onClick={() => void commit()}
          >
            {collides ? 'Merge' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  );
}
