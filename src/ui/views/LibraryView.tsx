import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isLive } from '../../db/types';
import type { Page } from '../../db/types';
import { tagCounts } from '../../db/pages';
import { hrefFor, navigate } from '../router';
import { TagFilter } from '../components/TagFilter';
import { isStub, matchesQuery, matchesTags, sortPages } from '../search';
import type { SortKey, TagFilter as Filter } from '../search';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'edited', label: 'Recent' },
];

export function LibraryView() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('title');
  const [filter, setFilter] = useState<Filter>({ tags: [], mode: 'all' });

  const pages = useLiveQuery(async () => (await db.pages.toArray()).filter(isLive), [], undefined);
  const counts = useLiveQuery(() => tagCounts(), [], []);

  const visible = useMemo(() => {
    if (!pages) return [];
    return sortPages(
      pages.filter((page) => matchesQuery(page, query) && matchesTags(page, filter)),
      sort,
    );
  }, [pages, query, sort, filter]);

  const narrowed = query.trim().length > 0 || filter.tags.length > 0;

  if (!pages) return <div className="view" />;

  return (
    <div className="view">
      <header className="view__header">
        <h1 className="view__title">Library</h1>
        <span className="view__count">
          {narrowed ? `${visible.length} of ${pages.length}` : `${pages.length} songs`}
        </span>
      </header>

      <div className="toolbar">
        <div className="toolbar__search">
          <input
            className="field"
            type="search"
            inputMode="search"
            placeholder="Search songs, artists, lyrics, tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search the library"
          />
        </div>
        <div className="row">
          <div className="sort-group" role="group" aria-label="Sort by">
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                className="sort-group__option"
                aria-pressed={sort === option.key}
                onClick={() => setSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <a className="btn btn--primary" href={hrefFor({ name: 'newPage' })}>
            New song
          </a>
        </div>
        <TagFilter counts={counts ?? []} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <EmptyState hasLibrary={pages.length > 0} query={query} filter={filter} />
      ) : (
        <ul className="page-list">
          {visible.map((page) => (
            <PageRow key={page.id} page={page} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PageRow({ page }: { page: Page }) {
  return (
    <li>
      <button
        type="button"
        className="page-row"
        // The visible text is split across styled spans, which leaves screen readers reading a
        // run-on of song, artist and tags. Naming it explicitly keeps the row one clear target.
        aria-label={`${page.song || 'Untitled'}${page.artist ? ` by ${page.artist}` : ''}`}
        onClick={() => navigate({ name: 'page', id: page.id })}
      >
        <span className="page-row__body">
          <span className="page-row__song">{page.song || 'Untitled'}</span>
          <span className="page-row__meta">
            <span className="page-row__artist">{page.artist || 'No artist'}</span>
            {page.tags.length > 0 ? (
              <span className="page-row__tags">
                {page.tags.slice(0, 3).map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
                {page.tags.length > 3 ? <span className="chip">+{page.tags.length - 3}</span> : null}
              </span>
            ) : null}
          </span>
        </span>
        {isStub(page) ? <span className="stub-flag">No lyrics</span> : null}
      </button>
    </li>
  );
}

function EmptyState({
  hasLibrary,
  query,
  filter,
}: {
  hasLibrary: boolean;
  query: string;
  filter: Filter;
}) {
  if (hasLibrary) {
    // Say which of the two filters emptied the list, so the fix is obvious.
    if (filter.tags.length > 0 && !query.trim()) {
      return (
        <div className="empty">
          <p className="empty__title">
            No song has {filter.mode === 'all' ? 'all' : 'any'} of those tags.
          </p>
          <p>
            {filter.mode === 'all' && filter.tags.length > 1
              ? 'Try “Any of these” instead.'
              : 'Try a different tag.'}
          </p>
        </div>
      );
    }
    return (
      <div className="empty">
        <p className="empty__title">
          Nothing matches {query.trim() ? `“${query}”` : 'that filter'}.
        </p>
        <p>Search covers song, artist, lyrics and tags.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <p className="empty__title">The library is empty.</p>
      <p>Add a song, or import a spreadsheet to build a set in one go.</p>
    </div>
  );
}
