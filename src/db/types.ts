/**
 * The stored shapes. These are exactly what gets written to IndexedDB, to the export file, and
 * (from phase 8) to one JSON file per record in the sync repo — so a change here is a change to
 * the on-disk format everywhere.
 */

/** One song's sheet. Pages live in a single shared library; documents reference them. */
export type Page = {
  id: string;
  song: string;
  artist: string;
  /** Derived: `${song} - ${artist}`. Stored so it can be indexed and sorted on. */
  title: string;
  /** Plain text. May contain chord lines above the words, which is why the mono setting exists. */
  lyrics: string;
  tags: string[];
  /** Key, capo, tuning, cues. */
  notes?: string;
  /**
   * Saved display transposition, in semitones.
   *
   * Non-destructive: the stored `lyrics` keep their written key and this shifts what is *shown*.
   * It is a property of the song ("I always play this a step down"), not of the device, so it
   * syncs — unlike font size, which is per screen.
   */
  transpose?: number;
  createdAt: string;
  updatedAt: string;
  /** Soft delete, so a deletion propagates instead of looking like "never synced". */
  deletedAt?: string;
  /** Which device last wrote this. Shown in the conflict chooser. */
  deviceId: string;
  /**
   * `tightKey(name)`, persisted rather than computed.
   *
   * Import matching compares against this, and an index turns a 30-row import from 30 full-library
   * scans into 30 lookups. Recomputed on write and on import, never trusted from a file.
   */
  matchKey: string;
};

/** A named, ordered collection of page references — a setlist, a binder, a service order. */
export type Doc = {
  id: string;
  name: string;
  /** Ordered. This array *is* the page order. May repeat an id: a reprise is a real setlist. */
  pageIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deviceId: string;
};

/** Anything stored as a single key/value row: device id, theme, font size, sync token. */
export type Setting = {
  key: string;
  value: unknown;
};

export type RecordKind = 'page' | 'doc';

/** A page that is not deleted. Most queries want this and nothing else. */
export function isLive<T extends { deletedAt?: string }>(record: T): boolean {
  return !record.deletedAt;
}
