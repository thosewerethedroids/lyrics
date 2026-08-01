/**
 * Deciding, for each imported row, whether it names a song the library already has.
 *
 * Three outcomes, in descending confidence:
 *
 *   - `exact`  — the tight key matches an existing page, or a title-only row uniquely names one
 *                song already in the library. Same song; applied automatically.
 *   - `near`   — a looser comparison matches (dropped article, `(Live)` suffix, a small typo, a
 *                bare-hyphen re-split, a partial/prefix title, or a title shared by several songs).
 *                Might be the song the user meant; a ranked list of {@link Candidate}s is offered so
 *                the UI can ask *which* song to insert. Never applied silently.
 *   - `none`   — nothing matched. Becomes a stub page so the import is never blocked on lyrics.
 *
 * This module is pure: the rows and the existing pages go in, a plan comes out. No database, no
 * clock, no randomness — so the whole matching ladder is testable.
 */

import type { Page } from '../../db/types';
import type { RowInput } from './columns';
import { tightKey, looseKey, tight } from '../normalize';
import { ratio, editDistance } from '../similarity';
import { alternateBareHyphenParses } from '../pageName';

export type MatchKind = 'exact' | 'near' | 'none';

/** Why a candidate was offered, roughly ordered most to least confident. */
export type MatchReason = 'same-title' | 'article-or-suffix' | 'hyphen' | 'prefix' | 'typo';

/** One existing song offered for an uncertain row, for the "which song?" chooser. */
export type Candidate = {
  pageId: string;
  title: string;
  reason: MatchReason;
  /** 0..1, higher is a closer match. Only used to rank the chooser. */
  score: number;
};

export type PlanRow = {
  index: number;
  input: RowInput;
  kind: MatchKind;
  /** For `exact` and `near`: the existing page this row would attach to by default. */
  pageId?: string;
  /** For `near`: the display title of the default candidate, and why it was offered. */
  candidateTitle?: string;
  reason?: MatchReason;
  /** For `near`: every plausible song, best first, so the UI can let the user pick one. */
  candidates?: Candidate[];
};

export type Plan = {
  rows: PlanRow[];
  counts: { exact: number; near: number; none: number };
};

/** Anything at or above this normalised edit-distance ratio is worth *offering* as a typo match. */
const TYPO_THRESHOLD = 0.84;

/** A partial title must be at least this many characters before it is offered as a prefix match. */
const PREFIX_MIN = 3;

/**
 * A short title takes a big ratio hit from a single wrong letter — "Wagon Whele" vs "Wagon Wheel"
 * is a transposition that scores below {@link TYPO_THRESHOLD}. So a title of at least this length is
 * also offered when it is within {@link TITLE_MAX_EDITS} edits, regardless of ratio.
 */
const TITLE_TYPO_MIN_LEN = 5;
const TITLE_MAX_EDITS = 2;

/** Never overwhelm the chooser: cap how many songs a single row can offer. */
const MAX_CANDIDATES = 6;

type Index = {
  byTight: Map<string, Page>;
  byLoose: Map<string, Page>;
  /** tight(song) → every page with that title, so a title-only row can find its song(s). */
  bySong: Map<string, Page[]>;
  pages: Page[];
};

function buildIndex(existing: Page[]): Index {
  const byTight = new Map<string, Page>();
  const byLoose = new Map<string, Page>();
  const bySong = new Map<string, Page[]>();
  for (const page of existing) {
    const name = { song: page.song, artist: page.artist };
    // The persisted matchKey is authoritative for the tight rung; loose is computed here.
    if (!byTight.has(page.matchKey)) byTight.set(page.matchKey, page);
    const lk = looseKey(name);
    if (!byLoose.has(lk)) byLoose.set(lk, page);
    const sk = tight(page.song);
    const bucket = bySong.get(sk);
    if (bucket) bucket.push(page);
    else bySong.set(sk, [page]);
  }
  return { byTight, byLoose, bySong, pages: existing };
}

/** The tight comparison string for one imported row. */
function tightForRow(row: RowInput): string {
  return tightKey({ song: row.song, artist: row.artist });
}

/**
 * Gathers every existing song that could plausibly be what this row meant, best first.
 *
 * The list feeds the chooser, so it is deliberately generous — a same-title sibling, a looser
 * key, a bare-hyphen re-split, a partial/prefix title, and any close spelling all earn a slot.
 * The caller decides which one becomes the default; here we only rank and de-duplicate.
 */
function collectCandidates(row: RowInput, index: Index): Candidate[] {
  const songTight = tight(row.song);
  const combinedTight = tight(`${row.song} ${row.artist}`.trim());

  const best = new Map<string, Candidate>();
  const consider = (page: Page, reason: MatchReason, score: number) => {
    const prior = best.get(page.id);
    if (!prior || score > prior.score) {
      best.set(page.id, { pageId: page.id, title: page.title, reason, score });
    }
  };

  // Songs that share this exact title. When the row named no artist, these are the reason to ask.
  for (const page of index.bySong.get(songTight) ?? []) consider(page, 'same-title', 1);

  // A looser key: dropped article, or a "(Live)" / "(Remaster)" suffix.
  const loose = index.byLoose.get(looseKey({ song: row.song, artist: row.artist }));
  if (loose) consider(loose, 'article-or-suffix', 0.95);

  // A bare-hyphen re-split of a single-column row: "Ring of Fire-Johnny Cash".
  for (const alt of alternateBareHyphenParses(row.raw)) {
    const hit = index.byTight.get(tightKey(alt)) ?? index.byLoose.get(looseKey(alt));
    if (hit) consider(hit, 'hyphen', 0.9);
  }

  // Partial / not-the-full-title: the typed name is a prefix of a real one ("Wonder" → "Wonderwall").
  if (songTight.length >= PREFIX_MIN) {
    for (const page of index.pages) {
      const ps = tight(page.song);
      if (ps !== songTight && ps.startsWith(songTight)) {
        consider(page, 'prefix', songTight.length / ps.length);
      }
    }
  }

  // A genuine typo, compared both on the whole name and on the title alone. A short title also
  // qualifies on a small absolute edit distance ("Wagon Whele" → "Wagon Wheel"), which its length
  // otherwise keeps below the ratio threshold.
  const songChars = [...songTight];
  for (const page of index.pages) {
    const whole = ratio(combinedTight, tight(`${page.song} ${page.artist}`.trim()));
    const titleOnly = ratio(songTight, tight(page.song));
    const score = Math.max(whole, titleOnly);

    if (score >= TYPO_THRESHOLD) {
      consider(page, 'typo', score);
      continue;
    }

    // Short-title fallback: a couple of edits on a title this long is a typo the ratio underrates.
    if (songTight.length >= TITLE_TYPO_MIN_LEN) {
      const pageChars = [...tight(page.song)];
      const dist = editDistance(songChars, pageChars);
      if (dist > 0 && dist <= TITLE_MAX_EDITS) {
        consider(page, 'typo', 1 - dist / Math.max(songChars.length, pageChars.length));
      }
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
}

/**
 * Picks the default candidate by the ladder's confidence order, not by raw score.
 *
 * A looser-key or hyphen match is a more trustworthy "this is the song" signal than a high
 * edit-distance ratio, even when the ratio is numerically larger, so those win the default slot.
 */
function choosePrimary(row: RowInput, index: Index, candidates: Candidate[]): Candidate {
  const order: MatchReason[] = ['same-title', 'article-or-suffix', 'hyphen', 'prefix', 'typo'];
  const byId = new Map(candidates.map((c) => [c.pageId, c]));

  const loose = index.byLoose.get(looseKey({ song: row.song, artist: row.artist }));
  if (loose && byId.has(loose.id)) return { ...byId.get(loose.id)!, reason: 'article-or-suffix' };

  for (const alt of alternateBareHyphenParses(row.raw)) {
    const hit = index.byTight.get(tightKey(alt)) ?? index.byLoose.get(looseKey(alt));
    if (hit && byId.has(hit.id)) return { ...byId.get(hit.id)!, reason: 'hyphen' };
  }

  return [...candidates].sort(
    (a, b) => order.indexOf(a.reason) - order.indexOf(b.reason) || b.score - a.score,
  )[0]!;
}

function planRow(row: RowInput, index: Index): PlanRow {
  const base = { index: row.index, input: row };

  // Rung 1 — tight key on song + artist. Same song, applied automatically.
  const exact = index.byTight.get(tightForRow(row));
  if (exact) return { ...base, kind: 'exact', pageId: exact.id };

  // Rung 2 — a title-only row ("1979", no artist) against songs stored with an artist. A unique
  // title is confident enough to apply; a title several songs share becomes a question.
  if (!row.artist) {
    const siblings = index.bySong.get(tight(row.song)) ?? [];
    if (siblings.length === 1) return { ...base, kind: 'exact', pageId: siblings[0]!.id };
    if (siblings.length > 1) {
      const candidates = siblings.map<Candidate>((page) => ({
        pageId: page.id,
        title: page.title,
        reason: 'same-title',
        score: 1,
      }));
      return {
        ...base,
        kind: 'near',
        pageId: candidates[0]!.pageId,
        candidateTitle: candidates[0]!.title,
        reason: 'same-title',
        candidates,
      };
    }
  }

  // Rungs 3+ — everything looser. The primary reason follows the ordered ladder (so a dropped
  // article reads as "article/version" rather than the typo it also technically is), while the
  // full candidate list still carries every option the chooser should show.
  const candidates = collectCandidates(row, index);
  if (candidates.length > 0) {
    const primary = choosePrimary(row, index, candidates);
    const ordered = [primary, ...candidates.filter((c) => c.pageId !== primary.pageId)];
    return {
      ...base,
      kind: 'near',
      pageId: primary.pageId,
      candidateTitle: primary.title,
      reason: primary.reason,
      candidates: ordered,
    };
  }

  // Nothing matched — this row will create a stub.
  return { ...base, kind: 'none' };
}

export function planImport(rows: RowInput[], existing: Page[]): Plan {
  const index = buildIndex(existing);
  const planned = rows.map((row) => planRow(row, index));
  const counts = { exact: 0, near: 0, none: 0 };
  for (const row of planned) counts[row.kind] += 1;
  return { rows: planned, counts };
}
