/**
 * A thin GitHub Contents API client — just the four calls sync needs.
 *
 * The library lives in a private repository as one JSON file per record (`pages/<id>.json`,
 * `documents/<id>.json`), so two devices editing different songs touch different files and never
 * collide. Every write carries the file's blob `sha` for optimistic concurrency: GitHub rejects a
 * PUT whose `sha` is stale, which is exactly the signal the engine uses to detect a conflict.
 *
 * The token is a fine-grained personal access token scoped to this one repo. A read-only token
 * (the phones) can list and fetch but is refused on PUT with a 403 — the enforced guarantee that
 * only the authoring device can change the sheets.
 */

export type RepoRef = { owner: string; repo: string; branch: string };

export type RemoteEntry = { path: string; sha: string; name: string };

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API = 'https://api.github.com';

/** `owner/repo` (optionally with a `#branch`) into its parts; branch defaults to `main`. */
export function parseRepo(input: string): RepoRef | null {
  const trimmed = input.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const [path, branch] = trimmed.split('#');
  const parts = (path ?? '').split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0]!, repo: parts[1]!, branch: (branch || 'main').trim() };
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64decode(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function request(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json };
}

export type Connection = { ok: true; canPush: boolean } | { ok: false; reason: string };

/** Confirms the repo is reachable and reports whether this token may publish (push) to it. */
export async function testConnection(repo: RepoRef, token: string): Promise<Connection> {
  try {
    const { status, json } = await request(token, 'GET', `/repos/${repo.owner}/${repo.repo}`);
    if (status === 200) {
      const perms = (json as { permissions?: { push?: boolean } }).permissions;
      return { ok: true, canPush: perms?.push === true };
    }
    if (status === 401) return { ok: false, reason: 'That token was rejected. Check you copied it whole.' };
    if (status === 404)
      return {
        ok: false,
        reason: 'Repo not found, or this token cannot see it. Check the name and the token scope.',
      };
    return { ok: false, reason: `GitHub returned ${status}.` };
  } catch {
    return { ok: false, reason: 'Could not reach GitHub. Check your connection.' };
  }
}

/** Lists a directory. A missing directory (empty repo) is not an error — it lists as empty. */
export async function listDir(repo: RepoRef, token: string, dir: string): Promise<RemoteEntry[]> {
  const { status, json } = await request(
    token,
    'GET',
    `/repos/${repo.owner}/${repo.repo}/contents/${dir}?ref=${encodeURIComponent(repo.branch)}`,
  );
  if (status === 404) return [];
  if (status !== 200) throw new GitHubError(`Could not list ${dir}`, status);
  if (!Array.isArray(json)) return [];
  return (json as { type: string; path: string; sha: string; name: string }[])
    .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
    .map((e) => ({ path: e.path, sha: e.sha, name: e.name }));
}

export async function getFile(
  repo: RepoRef,
  token: string,
  path: string,
): Promise<{ text: string; sha: string } | null> {
  const { status, json } = await request(
    token,
    'GET',
    `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(repo.branch)}`,
  );
  if (status === 404) return null;
  if (status !== 200) throw new GitHubError(`Could not fetch ${path}`, status);
  const file = json as { content: string; sha: string };
  return { text: b64decode(file.content), sha: file.sha };
}

/**
 * Creates or updates a file. Pass the known `sha` to update; omit it to create.
 *
 * A 409/422 means the `sha` was stale — someone else wrote first — which the engine turns into a
 * conflict rather than an overwrite. A 403 means the token is read-only.
 */
export async function putFile(
  repo: RepoRef,
  token: string,
  path: string,
  text: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const { status, json } = await request(
    token,
    'PUT',
    `/repos/${repo.owner}/${repo.repo}/contents/${path}`,
    {
      message,
      content: b64encode(text),
      branch: repo.branch,
      ...(sha ? { sha } : {}),
    },
  );
  if (status === 200 || status === 201) {
    return { sha: (json as { content: { sha: string } }).content.sha };
  }
  if (status === 403) throw new GitHubError('read-only', 403);
  if (status === 409 || status === 422) throw new GitHubError('stale-sha', status);
  throw new GitHubError(`Could not write ${path} (${status})`, status);
}
