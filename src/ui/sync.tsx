import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useToast } from './components/Toast';
import {
  syncNow,
  resolveConflict,
  countPending,
  type Conflict,
  type Resolution,
} from '../sync/engine';
import { getSyncConfig, getSyncStatus, type SyncStatus } from '../sync/state';

/**
 * App-wide sync state.
 *
 * A pull runs once on open so the device that only ever reads (the phones) is current the moment
 * it is picked up, with no button to remember. Conflicts surface here and are rendered by a chooser
 * in the app shell, so a two-sided edit is resolved wherever the user happens to be, not buried in
 * a settings screen they might not open.
 */

type SyncContext = {
  configured: boolean;
  canPush: boolean;
  status: SyncStatus;
  pending: number;
  conflicts: Conflict[];
  busy: boolean;
  refresh: () => Promise<void>;
  runSync: (opts?: { silent?: boolean }) => Promise<void>;
  resolve: (conflict: Conflict, choice: Resolution) => Promise<void>;
};

const Context = createContext<SyncContext | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [configured, setConfigured] = useState(false);
  const [canPush, setCanPush] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({});
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const config = await getSyncConfig();
    setConfigured(!!config);
    setCanPush(config?.canPush ?? false);
    setStatus(await getSyncStatus());
    setPending(await countPending());
  }, []);

  const runSync = useCallback<SyncContext['runSync']>(
    async (opts) => {
      const config = await getSyncConfig();
      if (!config) return;
      setBusy(true);
      const outcome = await syncNow();
      setBusy(false);
      await refresh();
      if (outcome.conflicts.length > 0) {
        setConflicts((current) => mergeConflicts(current, outcome.conflicts));
        toast.show(
          `${outcome.conflicts.length} ${outcome.conflicts.length === 1 ? 'conflict' : 'conflicts'} need a choice.`,
        );
        return;
      }
      if (!opts?.silent) {
        if (outcome.ok) {
          const bits: string[] = [];
          if (outcome.pulled) bits.push(`${outcome.pulled} in`);
          if (outcome.pushed) bits.push(`${outcome.pushed} out`);
          toast.show(bits.length ? `Synced — ${bits.join(', ')}.` : 'Already up to date.');
        } else if (outcome.error) {
          toast.show(outcome.error);
        }
      }
    },
    [refresh, toast],
  );

  const resolve = useCallback<SyncContext['resolve']>(
    async (conflict, choice) => {
      await resolveConflict(conflict, choice);
      setConflicts((current) => current.filter((c) => c.path !== conflict.path));
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      const config = await getSyncConfig();
      if (config) void runSync({ silent: true });
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount: the open-app pull.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A cheap fingerprint of the store that changes whenever any record is written. On a publishing
  // device this drives a debounced push, so an edit reaches the repo a few seconds after the last
  // keystroke without a Save button — and the debounce means a burst of edits is one push, not ten.
  const fingerprint = useLiveQuery(async () => {
    const newest = (rows: { updatedAt: string }[]) =>
      rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), '');
    const [pages, docs] = await Promise.all([db.pages.toArray(), db.documents.toArray()]);
    return `${pages.length}:${docs.length}:${newest(pages)}:${newest(docs)}`;
  }, []);

  const firstFingerprint = useRef<string | null>(null);
  useEffect(() => {
    if (fingerprint === undefined) return;
    // Ignore the first value — that is just the store loading, not an edit.
    if (firstFingerprint.current === null) {
      firstFingerprint.current = fingerprint;
      return;
    }
    if (firstFingerprint.current === fingerprint) return;
    firstFingerprint.current = fingerprint;
    if (!configured || !canPush) return;
    const timer = window.setTimeout(() => void runSync({ silent: true }), 3000);
    return () => window.clearTimeout(timer);
  }, [fingerprint, configured, canPush, runSync]);

  const value = useMemo<SyncContext>(
    () => ({ configured, canPush, status, pending, conflicts, busy, refresh, runSync, resolve }),
    [configured, canPush, status, pending, conflicts, busy, refresh, runSync, resolve],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function mergeConflicts(current: Conflict[], incoming: Conflict[]): Conflict[] {
  const byPath = new Map(current.map((c) => [c.path, c]));
  for (const c of incoming) byPath.set(c.path, c);
  return [...byPath.values()];
}

export function useSync(): SyncContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
