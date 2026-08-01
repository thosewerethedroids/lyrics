import { useState } from 'react';
import { tight } from '../../core/normalize';
import type { TagFilter as Filter } from '../search';
import type { TagCount } from '../../db/pages';

type Props = {
  /** Tags available to filter by, with how many pages carry each. Most-used first. */
  counts: TagCount[];
  value: Filter;
  onChange: (next: Filter) => void;
};

/**
 * Tag filtering for the library and for a document.
 *
 * The all/any choice is one toggle inside this panel rather than two screens, because it is a
 * property of the filter you are already building — "opener AND acoustic" and "opener OR acoustic"
 * are the same question asked two ways, and switching between them should not lose your selection.
 *
 * Collapsed by default so the panel never pushes the songs off the screen, but any active tags
 * stay visible on the button, since a filter you have forgotten about is worse than no filter.
 */
export function TagFilter({ counts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  if (counts.length === 0) return null;

  const selected = new Set(value.tags.map(tight));
  const active = value.tags.length;

  function toggle(tag: string) {
    const key = tight(tag);
    const next = selected.has(key)
      ? value.tags.filter((t) => tight(t) !== key)
      : [...value.tags, tag];
    onChange({ ...value, tags: next });
  }

  return (
    <div className="tag-filter">
      <div className="row">
        <button
          type="button"
          className={`btn btn--small${active ? ' btn--on' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {active ? `Tags · ${active}` : 'Filter by tag'}
        </button>

        {active > 0 ? (
          <>
            <span className="tag-filter__summary">
              {value.tags.join(value.mode === 'all' ? ' + ' : ' / ')}
            </span>
            <button
              type="button"
              className="btn btn--small btn--quiet"
              onClick={() => onChange({ ...value, tags: [] })}
            >
              Clear
            </button>
          </>
        ) : null}
      </div>

      {open ? (
        <div className="tag-filter__panel">
          <div className="row">
            <span className="tag-filter__label">Match</span>
            <div className="sort-group" role="group" aria-label="Match all or any of the tags">
              {(['all', 'any'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="sort-group__option"
                  aria-pressed={value.mode === mode}
                  onClick={() => onChange({ ...value, mode })}
                >
                  {mode === 'all' ? 'All of these' : 'Any of these'}
                </button>
              ))}
            </div>
          </div>

          <ul className="tag-filter__tags">
            {counts.map(({ tag, count }) => {
              const on = selected.has(tight(tag));
              return (
                <li key={tag}>
                  <button
                    type="button"
                    className={`chip chip--toggle${on ? ' chip--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(tag)}
                  >
                    {tag}
                    <span className="chip__count">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
