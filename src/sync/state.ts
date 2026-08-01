/**
 * Everything sync needs to remember between runs, kept in IndexedDB (never localStorage — the
 * token in particular must not sit in a store every script on the origin can read).
 *
 *   - the connection config (repo, token, whether this device may publish)
 *   - a per-file "mark": the blob sha and `updatedAt` we last reconciled that record at, which is
 *     how the engine tells a remote change apart from a change we already have
 *   - a small status the settings screen shows: last sync time and last error
 */

import { getSetting, setSetting, deleteSetting } from '../db/settings';

export type SyncConfig = {
  /** `owner/repo` or `owner/repo#branch`. */
  repo: string;
  token: string;
  /** Set from the repo's permissions on Test connection: false for a read-only (phone) token. */
  canPush: boolean;
};

export type Mark = { sha: string; updatedAt: string };
export type Marks = Record<string, Mark>;

export type SyncStatus = {
  lastSyncedAt?: string;
  lastError?: string;
};

const CONFIG_KEY = 'syncConfig';
const MARKS_KEY = 'syncMarks';
const STATUS_KEY = 'syncStatus';

export async function getSyncConfig(): Promise<SyncConfig | null> {
  return getSetting<SyncConfig | null>(CONFIG_KEY, null);
}

export async function setSyncConfig(config: SyncConfig): Promise<void> {
  await setSetting(CONFIG_KEY, config);
}

export async function clearSync(): Promise<void> {
  await deleteSetting(CONFIG_KEY);
  await deleteSetting(MARKS_KEY);
  await deleteSetting(STATUS_KEY);
}

export async function getMarks(): Promise<Marks> {
  return getSetting<Marks>(MARKS_KEY, {});
}

export async function setMarks(marks: Marks): Promise<void> {
  await setSetting(MARKS_KEY, marks);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return getSetting<SyncStatus>(STATUS_KEY, {});
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await setSetting(STATUS_KEY, status);
}
