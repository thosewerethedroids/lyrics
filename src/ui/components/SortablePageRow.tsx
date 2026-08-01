import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Page } from '../../db/types';
import { isStub } from '../search';

type Props = {
  slotId: string;
  index: number;
  page: Page | undefined;
  onOpen: () => void;
  onRemove: () => void;
};

/**
 * One row of a document's running order, draggable by its handle.
 *
 * The handle is a separate target from the row body on purpose: the body is a tap to open the
 * song, and only the handle lifts the row. Merging them would make every attempt to open a song on
 * a touchscreen risk starting a drag. Keyboard reorder is wired through the same handle — focus it
 * and dnd-kit's keyboard sensor turns the arrow keys into moves.
 */
export function SortablePageRow({ slotId, index, page, onOpen, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: slotId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`doc-row${isDragging ? ' doc-row--dragging' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="doc-row__handle"
        aria-label={`Reorder ${page?.song ?? 'song'}. Use the arrow keys to move it.`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <span className="doc-row__number" aria-hidden="true">
        {index + 1}
      </span>

      <button type="button" className="doc-row__body" onClick={onOpen}>
        <span className="doc-row__song">{page?.song || 'Untitled'}</span>
        <span className="doc-row__meta">
          <span className="doc-row__artist">{page?.artist || 'No artist'}</span>
          {page && isStub(page) ? <span className="stub-flag">No lyrics</span> : null}
        </span>
      </button>

      <button
        type="button"
        className="doc-row__remove"
        aria-label={`Remove ${page?.song ?? 'song'} from this document`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}
