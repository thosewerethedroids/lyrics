/**
 * The sync run: reconcile the local store with the private GitHub repo, one record at a time.
 *
 * The heavy thinking is in {@link classify}; this file is the plumbing around it — listing the
 * remote, fetching only what changed, writing pulls into IndexedDB, pushing local edits with their
 * blob sha for optimistic concurrency, and collecting two-sided changes as conflicts for the user
 * to resolve rather than resolving them itself. Nothing here ever discards an edit silently.
 */

import { db } from '../db/db';
import type { Doc, Page } from '../db/types';
import { nowIso, uuid } from '../core/ids';
import { displayTitle } from '../core/pageName';
import { tightKey } from '../core/normalize';
import { getDeviceId } from '../db/settings';
import { parseRepo, listDir, getFile, putFile, GitHubError } from './github';
import type { RepoRef } from './github';
import { classify } from './reconcile';
import {
  getSyncConfig,
  getMarks,
  setMarks,
  setSyncStatus,
  type Marks,
} from './state';

export type RecordKind = 'page' | 'doc';

export type Conflict = {
  kind: RecordKind;
  id: string;
  path: string;
  local: Page | Doc;
  remote: Page | Doc;
  remoteSha: string;
};

export type SyncOutcome = {
  ok: boolean;
  pulled: number;
  pushed: number;
  conflicts: Conflict[];
  error?: string;
  readOnlyBlocked?: boolean;
};

type Collection = {
  kind: RecordKind;
  dir: string;
  table: typeof db.pages | typeof db.documents;
};

const COLLECTIONS: Collection[] = [
  { kind: 'page', dir: 'pages', table: db.pages },
  { kind: 'doc', dir: 'documents', table: db.documents },
];

function pathFor(kind: RecordKind, id: string): string {
  return `${kind === 'page' ? 'pages' : 'documents'}/${id}.json`;
}

function updatedAtOf(record: Page | Doc): string {
  return record.updatedAt;
}

/**
 * Runs one full sync. Safe to call on app open and from a "Sync now" button; a read-only device
 * simply skips every push. Conflicts are returned, not thrown — the caller shows the chooser.
 */
export async function syncNow(): Promise<SyncOutcome> {
  const config = await getSyncConfig();
  if (!config) return { ok: false, pulled: 0, pushed: 0, conflicts: [], error: 'Sync is not set up.' };

  const repo = parseRepo(config.repo);
  if (!repo) {
    return { ok: false, pulled: 0, pushed: 0, conflicts: [], error: 'The repo name looks wrong.' };
  }

  const marks = { ...(await getMarks()) };
  const outcome: SyncOutcome = { ok: true, pulled: 0, pushed: 0, conflicts: [] };

  try {
    for (const collection of COLLECTIONS) {
      await syncCollection(repo, config.token, config.canPush, collection, marks, outcome);
    }
    await setMarks(marks);
    await setSyncStatus({ lastSyncedAt: nowIso(), lastError: outcome.error });
  } catch (err) {
    const message =
      err instanceof GitHubError && err.status === 401
        ? 'The token was rejected — it may have expired. Generate a new one.'
        : 'Sync could not finish. Your local copy is untouched.';
    await setMarks(marks);
    await setSyncStatus({ lastError: message });
    return { ...outcome, ok: false, error: message };
  }

  return outcome;
}

async function syncCollection(
  repo: RepoRef,
  token: string,
  canPush: boolean,
  collection: Collection,
  marks: Marks,
  outcome: SyncOutcome,
): Promise<void> {
  const remote = await listDir(repo, token, collection.dir);
  const remoteBySha = new Map(remote.map((e) => [e.path, e.sha]));

  const localRows = (await collection.table.toArray()) as (Page | Doc)[];
  const localById = new Map(localRows.map((r) => [r.id, r]));

  // The union of ids seen locally and remotely.
  const ids = new Set<string>(localRows.map((r) => r.id));
  for (const entry of remote) {
    const id = entry.name.replace(/\.json$/, '');
    ids.add(id);
  }

  for (const id of ids) {
    const path = pathFor(collection.kind, id);
    const local = localById.get(id);
    const remoteSha = remoteBySha.get(path);
    const mark = marks[path];

    const action = classify({
      localUpdatedAt: local ? updatedAtOf(local) : undefined,
      remoteSha,
      syncedSha: mark?.sha,
      syncedUpdatedAt: mark?.updatedAt,
    });

    if (action === 'none') continue;

    if (action === 'pull') {
      const file = await getFile(repo, token, path);
      if (!file) continue;
      const record = JSON.parse(file.text) as Page | Doc;
      await collection.table.put(record as never);
      marks[path] = { sha: file.sha, updatedAt: record.updatedAt };
      outcome.pulled += 1;
      continue;
    }

    if (action === 'push') {
      if (!canPush) continue; // read-only device: keep local, never publish
      if (!local) continue;
      try {
        const { sha } = await putFile(
          repo,
          token,
          path,
          JSON.stringify(local, null, 2),
          `Update ${path}`,
          mark?.sha,
        );
        marks[path] = { sha, updatedAt: local.updatedAt };
        outcome.pushed += 1;
      } catch (err) {
        if (err instanceof GitHubError && err.status === 403) {
          outcome.readOnlyBlocked = true;
          outcome.error = 'This token is read-only, so edits stayed on this device.';
          continue;
        }
        if (err instanceof GitHubError && (err.status === 409 || err.status === 422)) {
          // Our sha was stale: the remote moved under us. Treat as a conflict, don't overwrite.
          await addConflict(repo, token, collection.kind, id, path, local, outcome);
          continue;
        }
        throw err;
      }
      continue;
    }

    if (action === 'conflict' && local) {
      await addConflict(repo, token, collection.kind, id, path, local, outcome);
    }
  }
}

async function addConflict(
  repo: RepoRef,
  token: string,
  kind: RecordKind,
  id: string,
  path: string,
  local: Page | Doc,
  outcome: SyncOutcome,
): Promise<void> {
  const file = await getFile(repo, token, path);
  if (!file) return;
  outcome.conflicts.push({
    kind,
    id,
    path,
    local,
    remote: JSON.parse(file.text) as Page | Doc,
    remoteSha: file.sha,
  });
}

/** How the user resolved one conflict from the chooser. */
export type Resolution = 'mine' | 'theirs' | 'both';

/**
 * Applies a conflict resolution.
 *
 *   - `theirs` — take the remote version locally.
 *   - `mine`   — publish the local version over the remote (using the remote's current sha).
 *   - `both`   — take the remote version, and keep the local one as a new "(conflict copy)" record
 *                so the edit survives; it publishes on the next sync.
 */
export async function resolveConflict(conflict: Conflict, choice: Resolution): Promise<void> {
  const config = await getSyncConfig();
  if (!config) return;
  const repo = parseRepo(config.repo);
  if (!repo) return;

  const marks = { ...(await getMarks()) };
  const table = conflict.kind === 'page' ? db.pages : db.documents;

  if (choice === 'theirs' || choice === 'both') {
    await table.put(conflict.remote as never);
    marks[conflict.path] = { sha: conflict.remoteSha, updatedAt: conflict.remote.updatedAt };
  }

  if (choice === 'both') {
    await keepLocalAsCopy(conflict);
  }

  if (choice === 'mine' && config.canPush) {
    const { sha } = await putFile(
      repo,
      config.token,
      conflict.path,
      JSON.stringify(conflict.local, null, 2),
      `Resolve ${conflict.path} — keep this device's version`,
      conflict.remoteSha,
    );
    marks[conflict.path] = { sha, updatedAt: conflict.local.updatedAt };
  }

  await setMarks(marks);
}

async function keepLocalAsCopy(conflict: Conflict): Promise<void> {
  const deviceId = await getDeviceId();
  const now = nowIso();
  const id = uuid();

  if (conflict.kind === 'page') {
    const p = conflict.local as Page;
    const song = `${p.song} (conflict copy)`;
    const copy: Page = {
      ...p,
      id,
      song,
      title: displayTitle({ song, artist: p.artist }),
      matchKey: tightKey({ song, artist: p.artist }),
      createdAt: now,
      updatedAt: now,
      deviceId,
    };
    await db.pages.put(copy);
  } else {
    const d = conflict.local as Doc;
    const copy: Doc = {
      ...d,
      id,
      name: `${d.name} (conflict copy)`,
      createdAt: now,
      updatedAt: now,
      deviceId,
    };
    await db.documents.put(copy);
  }
}

/** Records waiting to be published from this device — shown as the pending count before a sync. */
export async function countPending(): Promise<number> {
  const config = await getSyncConfig();
  if (!config || !config.canPush) return 0;
  const marks = await getMarks();
  let pending = 0;
  for (const collection of COLLECTIONS) {
    const rows = (await collection.table.toArray()) as (Page | Doc)[];
    for (const row of rows) {
      const mark = marks[pathFor(collection.kind, row.id)];
      if (!mark || mark.updatedAt !== row.updatedAt) pending += 1;
    }
  }
  return pending;
}
