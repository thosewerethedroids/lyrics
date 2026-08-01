/**
 * Deciding what to do with a single record during a sync — pure, so the whole decision table is
 * testable without a network or a database.
 *
 * Three facts drive it: whether the record changed remotely (its blob `sha` differs from the one
 * we last reconciled), whether it changed locally (its `updatedAt` differs from the one we last
 * reconciled), and whether each side exists at all. The one outcome we never take automatically is
 * a two-sided change: that is a conflict, and it goes to the chooser so neither edit is lost.
 */

export type SyncAction = 'pull' | 'push' | 'conflict' | 'none';

export type ReconcileInput = {
  /** `updatedAt` of the local record, or undefined if this record does not exist locally. */
  localUpdatedAt?: string;
  /** Current blob sha on the remote, or undefined if the file does not exist remotely. */
  remoteSha?: string;
  /** The blob sha we last reconciled this record at, if ever. */
  syncedSha?: string;
  /** The `updatedAt` we last reconciled this record at, if ever. */
  syncedUpdatedAt?: string;
};

export function classify(input: ReconcileInput): SyncAction {
  const { localUpdatedAt, remoteSha, syncedSha, syncedUpdatedAt } = input;

  const hasLocal = localUpdatedAt !== undefined;
  const hasRemote = remoteSha !== undefined;

  if (!hasLocal && !hasRemote) return 'none';
  if (!hasRemote) return 'push'; // new locally, never pushed
  if (!hasLocal) return 'pull'; // new remotely, never seen here

  const remoteChanged = remoteSha !== syncedSha;
  const localChanged = localUpdatedAt !== syncedUpdatedAt;

  if (remoteChanged && localChanged) return 'conflict';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'none';
}
