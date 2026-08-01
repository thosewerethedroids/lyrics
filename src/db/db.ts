import Dexie, { type Table } from 'dexie';
import type { Doc, Page, Setting } from './types';

/**
 * The local store — the source of truth on each device.
 *
 * Everything the app reads comes from here, so every view works in airplane mode by construction.
 * Sync (phase 8) is a separate process that reconciles this store with a remote copy; no view
 * ever waits on the network.
 */
export class BinderDB extends Dexie {
  pages!: Table<Page, string>;
  documents!: Table<Doc, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'lyrics-binder') {
    super(name);

    // `deletedAt` is intentionally not indexed: IndexedDB skips records whose indexed key is
    // undefined, so a "not deleted" query cannot be expressed as an index lookup. Soft-deleted
    // rows are filtered in JS instead, which is free at this library's size.
    this.version(1).stores({
      pages: 'id, matchKey, title, artist, song, updatedAt, *tags',
      documents: 'id, name, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new BinderDB();
