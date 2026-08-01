# Lyrics Binder

A digital lyrics binder for the stage. A **document** is an ordered set of **pages**; each page is
one song's lyrics (with optional chords). Build documents fast from spreadsheets, reorder by
dragging, tag and filter, and read them full screen from whatever device is in front of you.

It is a web app — no App Store, no Apple Developer account, no recurring cost — that installs to the
home screen as a PWA and works offline. IndexedDB is the source of truth on each device; sync is
layered on top and never blocks reading or editing.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # the full test suite
```

## Design

Dark by default ("Stage Black"): pure-black reading surface, warm off-white lyrics at full
contrast, chords in green, everything else receding. A light mode is there for daylight. Type size
in the performance view auto-fits the screen, or can be set by hand and persists per device.

## The three views

- **Library** — every song, searchable across song, artist, lyrics, and tags.
- **Document** — the running order, drag to reorder (works with a finger on iOS), keyboard reorder
  on a Mac. Reorder saves immediately.
- **Performance** — full screen, no chrome, high contrast, screen wake lock. Advance with tap
  zones, swipe, arrow keys, or Page Up/Down (so a Bluetooth foot pedal works).

## Importing a spreadsheet

Documents → **Import spreadsheet**. Upload a `.csv`, `.tsv`, or `.xlsx`, or paste one song per line
(`Song - Artist`). Row order is page order. Names are matched against the library case-insensitively
(ignoring a leading `The` and extra spaces); near matches are offered for confirmation and names
that match nothing become stub pages you fill in later — an import is never blocked on missing
lyrics. Send the result to a new document, or apply it as the order of an existing one.

## Moving your library between devices

There are two layers; you can use either or both.

### Backup file (simplest)

Settings → **Export library** writes the whole library to one `.json` file — drop it in iCloud
Drive and **Import a backup** on another device. Merging keeps the most recently edited copy of
each record, so nothing newer is overwritten.

### GitHub sync (hands-off)

Best for the "edit on the Mac, read on the iPad" workflow, and it enforces that only the Mac can
edit.

1. Create a **private** repo to hold the data, e.g. `you/lyrics-binder-data` (empty is fine).
2. Create two fine-grained personal access tokens (GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens). For each: set an expiry, set **Resource owner**
   to your account, under **Repository access** choose **Only select repositories →
   lyrics-binder-data**, and under **Permissions → Repository → Contents** set:
   - **Read and write** — for the Mac (the author).
   - **Read-only** — for the iPhone and iPad.
3. In the app, Settings → **Sync**, enter `you/lyrics-binder-data`, paste the token, and press
   **Test connection**. It reports whether the token can publish, then **Save and sync**.

The Mac auto-publishes edits (debounced); phones pull automatically on open. A read-only token
physically cannot push, so the sheets can only change from the Mac. If two devices edit the same
song before syncing, a side-by-side chooser appears — keep one side, or keep both. Nothing is ever
discarded silently. Each change is a commit, so the repo doubles as version history.

## Deploy

### GitHub Pages (included)

Push this app to its own repo and the workflow in `.github/workflows/deploy.yml` builds and
publishes it on every push to `main` (enable Pages → Source: GitHub Actions once). It sets the
correct base path for a project site automatically.

### Cloudflare Pages

Connect the repo, set build command `npm run build` and output directory `dist`. Served from the
root, so no base path is needed.

Both are free with no card on file and nothing that expires or pauses.
