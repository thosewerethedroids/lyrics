import { useEffect, useState } from 'react';
import { useSync } from '../sync';
import { useToast } from './Toast';
import { getSyncConfig, setSyncConfig, clearSync } from '../../sync/state';
import { parseRepo, testConnection } from '../../sync/github';

/**
 * Connecting a device to the private sync repo.
 *
 * Test connection is the one place the token is exercised, and it reports back whether the token
 * can publish — so the Mac's read/write token and a phone's read-only token both land in the right
 * mode without the user having to declare which they pasted.
 */
export function SyncSettings() {
  const { configured, canPush, status, pending, busy, runSync, refresh } = useSync();
  const toast = useToast();

  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ canPush: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void getSyncConfig().then((config) => {
      if (config) setRepo(config.repo);
    });
  }, [configured]);

  async function test() {
    setError('');
    setTested(null);
    const ref = parseRepo(repo);
    if (!ref) {
      setError('Enter the repo as owner/repo, for example jeff/lyrics-binder-data.');
      return;
    }
    if (!token.trim()) {
      setError('Paste a token to test.');
      return;
    }
    setTesting(true);
    const result = await testConnection(ref, token.trim());
    setTesting(false);
    if (result.ok) {
      setTested({ canPush: result.canPush });
    } else {
      setError(result.reason);
    }
  }

  async function save() {
    if (!tested) return;
    await setSyncConfig({ repo: repo.trim(), token: token.trim(), canPush: tested.canPush });
    setToken('');
    setTested(null);
    await refresh();
    toast.show('Sync connected.');
    void runSync();
  }

  async function disconnect() {
    await clearSync();
    setRepo('');
    setToken('');
    setTested(null);
    await refresh();
    toast.show('Sync disconnected on this device.');
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Sync</h2>
      <p className="settings-section__note">
        Keep a private GitHub repo as the shared copy. Your Mac publishes edits; phones use a
        read-only token and pull automatically. The token is stored only on this device.
      </p>

      {configured ? (
        <>
          <dl className="kv">
            <dt>Repository</dt>
            <dd>{repo}</dd>
            <dt>This device</dt>
            <dd>{canPush ? 'Publishes edits' : 'Read-only'}</dd>
            <dt>Last synced</dt>
            <dd>{status.lastSyncedAt ? formatWhen(status.lastSyncedAt) : 'Never'}</dd>
            {canPush ? (
              <>
                <dt>Waiting to publish</dt>
                <dd>{pending}</dd>
              </>
            ) : null}
          </dl>
          {status.lastError ? (
            <p className="import-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
              {status.lastError}
            </p>
          ) : null}
          <div className="settings-row row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void runSync()}
            >
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          {error ? (
            <p className="import-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="settings-row">
            <label className="label" htmlFor="sync-repo">
              Repository
            </label>
            <input
              id="sync-repo"
              className="field"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="jeff/lyrics-binder-data"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="settings-row">
            <label className="label" htmlFor="sync-token">
              Access token
            </label>
            <input
              id="sync-token"
              className="field"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="settings-section__note">
              A fine-grained token scoped to just this repo, with Contents read-only on phones and
              read/write on the Mac.
            </p>
          </div>
          {tested ? (
            <p className="sync-ok" role="status">
              Connected — {tested.canPush ? 'this token can publish edits.' : 'this token is read-only.'}
            </p>
          ) : null}
          <div className="settings-row row">
            <button type="button" className="btn" disabled={testing} onClick={() => void test()}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!tested}
              onClick={() => void save()}
            >
              Save and sync
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
