# Build Prompt — Lyrics Binder (web app)

Paste this whole file into Claude Code as the opening prompt.

---

## Context

I previously had you build a version of this app in Swift at `~/Desktop/vibe/lyrics`.
**Do not port that code.** Swift/SwiftUI locks me into needing a paid Apple Developer
account to run it on my iPhone and iPad, which is exactly what I'm trying to avoid.

Read that project **only** to (a) understand the data model I ended up with and
(b) extract any lyrics/song data already in it so it can be migrated. Then start
fresh as a web app.

## What I'm building

A digital lyrics binder. A **document** is an ordered collection of **pages**; each
page is one song's lyrics. Think of a document as a setlist or a binder, and pages
as the sheets in it. I need to build documents fast from spreadsheets I already
maintain, reorder them by dragging, tag and filter songs, and read them on stage
from whichever device is in front of me.

## Hard constraints

1. **No App Store, no Apple Developer account, no native builds.** Web app only.
2. **No recurring costs.** Free hosting and free storage tiers only. If a design
   choice risks a future bill or a "your project was paused" email, pick the other one.
3. **Runs on iPhone, iPad, and MacBook** — installable to the home screen as a PWA
   so it opens full screen without Safari chrome.
4. **Works offline.** Venue wifi is unreliable. Reading and editing must work with
   no network; sync catches up later.

## Target stack

Unless you have a concrete reason to deviate — tell me first if you do:

- **Vite + React + TypeScript**
- **PWA**: service worker (`vite-plugin-pwa`), web app manifest, offline app shell
- **Local store**: IndexedDB via Dexie — this is the source of truth on each device
- **Drag and drop**: `dnd-kit` (`PointerSensor` + `TouchSensor` + `KeyboardSensor`).
  Do **not** use HTML5 native drag events — they don't fire on iOS Safari.
- **Spreadsheets**: SheetJS (`xlsx`) for `.xlsx`, PapaParse for `.csv`/`.tsv`
- **Hosting**: Cloudflare Pages or GitHub Pages, deployed from a private repo. Free,
  no card on file, no idle-timeout suspensions.

## Sync — build this in three layers

Sync is the part most likely to go wrong, so build it in this order and let each
layer stand on its own.

**Layer 1 — local-first (build first).** Everything lives in IndexedDB. The app is
fully usable on a single device with no account, no network, no backend. Every
record carries `updatedAt` and a `deviceId`.

**Layer 2 — export / import (build second).** One-tap export of the entire library
to a single `.json` file, and import that merges it back in. Saving that file to
iCloud Drive gives me the guaranteed fallback I said I'd accept: edit on the Mac,
open on the iPad. This layer must work even if Layer 3 is never finished.

**Layer 3 — real sync (build last).** Back the library with a **private GitHub
repository** through the GitHub Contents API, authenticated with a fine-grained
personal access token I paste into settings once per device and that is stored in
IndexedDB (never in source, never in `localStorage`).

- Persist as one JSON file per page (`pages/<id>.json`) plus one per document
  (`documents/<id>.json`), so two devices editing different songs never collide.
- Pull on app open and on manual "Sync now"; push on a debounce after edits.
- Use the blob SHA returned by the API for optimistic concurrency. On a conflict,
  keep both versions and show me a side-by-side chooser — **never silently discard
  an edit.**
- Show sync state plainly in the UI: last synced time, pending change count,
  and any error with what to do about it.

Why GitHub over the alternatives: free with no quota that a lyrics library will ever
approach, no service to keep alive, and every change is version-history I get for
free. If you think Cloudflare Workers + D1 is meaningfully better here, make the
case before building — don't just switch.

## Data model

```ts
type Page = {
  id: string;              // uuid, stable forever
  song: string;
  artist: string;
  title: string;           // derived: `${song} - ${artist}`, kept in sync
  lyrics: string;          // plain text / light markdown
  tags: string[];
  notes?: string;          // key, capo, tuning, cues
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;      // soft delete, so deletions propagate
};

type Doc = {
  id: string;
  name: string;
  pageIds: string[];       // ordered; this array IS the page order
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
```

**Pages live in one shared library.** A document holds *references*, not copies, so
the same song can sit in a dozen setlists and I only fix a typo once. Removing a
page from a document removes the reference only; deleting from the library asks for
confirmation and names every document affected.

## Page naming and matching

Pages are named `song-artist` — that's how my spreadsheets refer to them.

- Parse on the **last** ` - ` or `-` in the string, so `Ring of Fire - Johnny Cash`
  and `Man-Sized Wreath - The Decemberists` both land correctly.
- Match imports case-insensitively, ignoring extra whitespace and leading `The `.
- When a name almost matches an existing page, offer the near match rather than
  silently creating a duplicate.

## Spreadsheet import

Two entry points, both required:

1. **Upload** a `.csv`, `.tsv`, or `.xlsx` file.
2. **Paste** rows into a textarea — one page name per line — for when I'm on the iPad.

Behavior:

- **Row order is page order.** Row 1 is page 1. This is non-negotiable.
- Accept a single column of `song-artist` names, or separate `song` / `artist`
  columns, or an optional `tags` column (comma-separated). Detect the shape from
  the header row; if there's no header, ask me which column is which.
- Show a **preview before committing**: matched pages, near-matches needing my
  confirmation, and names with no match at all.
- Unmatched names become **stub pages** — title and tags filled in, lyrics empty —
  and get flagged in the UI so I can fill them in later. Never block an import
  because lyrics are missing.
- Two destinations: **create a new document** from the sheet, or **apply the sheet
  as the order** of an existing document.

## Tags and filtering

- A page can carry any number of tags. Free-form entry with autocomplete from tags
  already in use.
- Filter the library and filter within a document.
- Support both "has **all** of these tags" and "has **any** of these tags" — a
  toggle, not two separate screens.
- Show a tag's usage count so I can spot the ones I've fat-fingered, and let me
  rename a tag everywhere at once.

## Interface

Three views:

**Library** — every page, searchable across song, artist, lyrics, and tags. Sort by
title, artist, or recently edited.

**Document** — the ordered page list with drag handles. Dragging must feel right on
a touchscreen: long-press to lift, auto-scroll at the edges, a clear drop indicator,
and a haptic-feeling snap on release. Reorder saves immediately. Also give me
keyboard reorder (arrow keys on a focused handle) so it's usable on the Mac and
accessible.

**Performance** — the reason the app exists. Full screen, no chrome, high contrast,
adjustable font size that persists per device. Advance and go back with: tap zones
on the left and right thirds, swipe, arrow keys, and Page Up / Page Down — that last
one so a Bluetooth foot pedal works. Request a screen wake lock so it doesn't dim
mid-song. Show position ("4 of 17") and nothing else.

Design direction: this is for reading text under bad lighting while doing something
else with my hands. Type is the entire interface — pick a body face that stays
legible at a glance from three feet away and set a real type scale. Everything that
isn't lyrics should recede. Dark by default, with a light mode for daylight.

## Migration from the Swift build

Write a one-time script that reads whatever the SwiftData/Core Data store or seeded
files at `~/Desktop/vibe/lyrics` contain and emits a JSON file in the export format
from Layer 2, so I can import it on first run. If nothing worth migrating is in
there, say so and skip it — don't invent a migration.

## Build order

Ship each phase working before starting the next, and stop and show me at each mark.

1. Scaffold + data model + IndexedDB. Create, edit, delete pages. Library view.
2. Documents, page references, drag-and-drop reordering. Performance view.
3. Tags and filtering.
4. Spreadsheet import — both entry points, preview, both destinations.
5. Export / import JSON. Migration script from the Swift build.
6. PWA: manifest, icons, service worker, offline shell. Verify install to home
   screen on iPhone and iPad.
7. Deploy to Cloudflare Pages / GitHub Pages.
8. GitHub-backed sync, including the conflict chooser.

## Done means

- [ ] Installs to the iPhone and iPad home screen and opens full screen, with no
      Apple Developer account involved anywhere
- [ ] Fully usable in airplane mode — read, edit, reorder
- [ ] A 30-row spreadsheet becomes a correctly ordered 30-page document in under a
      minute, with unmatched names surfaced rather than swallowed
- [ ] Drag-to-reorder works with a finger on the iPad, not just a mouse
- [ ] An edit on the MacBook appears on the iPhone after a sync, and a conflicting
      edit on both never loses either version
- [ ] Total ongoing cost: $0, with no free tier that expires or pauses
- [ ] A Bluetooth pedal turns the page in performance view

## Before you write code

Tell me: your read of the Swift project and whether anything is worth migrating,
any place you'd deviate from the stack above and why, and anything in this spec
that's ambiguous enough to be worth settling now rather than rebuilding later.
