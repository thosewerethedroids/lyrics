import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isLive } from '../../db/types';
import { getDeviceId } from '../../db/settings';
import { exportToFile, importFromFile, BackupError } from '../../db/backup';
import { useToast } from '../components/Toast';
import { SyncSettings } from '../components/SyncSettings';
import { hrefFor } from '../router';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, usePrefs } from '../prefs';
import type { LyricFont, Theme } from '../prefs';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const FONTS: { value: LyricFont; label: string; hint: string }[] = [
  { value: 'sans', label: 'Sans', hint: 'Best for plain lyrics' },
  { value: 'mono', label: 'Mono', hint: 'Keeps chord lines above the right syllable' },
];

export function SettingsView() {
  const { prefs, set } = usePrefs();
  const toast = useToast();
  const [deviceId, setDeviceId] = useState('');
  const backupInput = useRef<HTMLInputElement>(null);

  async function onBackupFile(file: File) {
    try {
      const report = await importFromFile(await file.text());
      const total = report.pages + report.documents;
      toast.show(
        total === 0
          ? 'Already up to date — nothing newer in that file.'
          : `Merged ${report.pages} songs and ${report.documents} documents.`,
      );
    } catch (err) {
      toast.show(err instanceof BackupError ? err.message : 'Could not import that file.');
    }
  }

  const counts = useLiveQuery(async () => {
    const pages = (await db.pages.toArray()).filter(isLive);
    const docs = (await db.documents.toArray()).filter(isLive);
    return { pages: pages.length, docs: docs.length };
  }, [], undefined);

  useEffect(() => {
    void getDeviceId().then(setDeviceId);
  }, []);

  return (
    <div className="view">
      <header className="view__header">
        <h1 className="view__title">Settings</h1>
      </header>

      <section className="settings-section">
        <h2 className="settings-section__title">Appearance</h2>
        <p className="settings-section__note">These are per device and are never synced.</p>

        <div className="settings-row">
          <span className="label">Theme</span>
          <div className="sort-group" role="group" aria-label="Theme">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                className="sort-group__option"
                aria-pressed={prefs.theme === option.value}
                onClick={() => set('theme', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span className="label">Lyric typeface</span>
          <div className="sort-group" role="group" aria-label="Lyric typeface">
            {FONTS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="sort-group__option"
                aria-pressed={prefs.lyricFont === option.value}
                onClick={() => set('lyricFont', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="settings-section__note">
            {FONTS.find((font) => font.value === prefs.lyricFont)?.hint}
          </p>
        </div>

        <div className="settings-row">
          <label className="label" htmlFor="fontSize">
            Performance text size — {prefs.fontSize}px
          </label>
          <input
            id="fontSize"
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={prefs.fontSize}
            onChange={(event) => set('fontSize', Number(event.target.value))}
          />
          <p className="preview-lyrics" style={{ fontSize: `${prefs.fontSize}px` }}>
            And the whole band knows the second verse
          </p>
          <p className="settings-section__note">
            {prefs.autoFit
              ? 'Performance is currently sizing text to fit the screen, so this size is only used once you turn Fit off there.'
              : 'Performance is using this size. Turn Fit back on there to size text to the screen instead.'}
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Library</h2>
        <p className="settings-section__note">
          See how often each tag is used, rename one everywhere at once, or remove it.
        </p>
        <div className="settings-row">
          <a className="btn" href={hrefFor({ name: 'tags' })}>
            Manage tags
          </a>
        </div>
      </section>

      <SyncSettings />

      <section className="settings-section">
        <h2 className="settings-section__title">Backup</h2>
        <p className="settings-section__note">
          Export the whole library to one file — drop it in iCloud Drive to move it between devices.
          Importing merges by most-recent edit, so nothing already newer here is overwritten.
        </p>
        <input
          ref={backupInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onBackupFile(file);
            event.target.value = '';
          }}
        />
        <div className="settings-row row">
          <button type="button" className="btn" onClick={() => void exportToFile()}>
            Export library
          </button>
          <button type="button" className="btn" onClick={() => backupInput.current?.click()}>
            Import a backup
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">This device</h2>
        <dl className="kv">
          <dt>Songs</dt>
          <dd>{counts?.pages ?? '—'}</dd>
          <dt>Documents</dt>
          <dd>{counts?.docs ?? '—'}</dd>
          <dt>Device id</dt>
          <dd className="kv__mono">{deviceId || '—'}</dd>
        </dl>
      </section>
    </div>
  );
}
