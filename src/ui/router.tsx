import { useEffect, useState } from 'react';

/**
 * Hash routing, by hand.
 *
 * Hash routes are the one form that works identically on Cloudflare Pages, on GitHub Pages (which
 * has no SPA rewrite, so `/doc/abc` would 404 on reload), and inside an installed PWA launched
 * from the home screen. That is worth more here than a router library's nested-route features,
 * which this app has no use for.
 */

export type Route =
  | { name: 'library' }
  | { name: 'page'; id: string }
  | { name: 'newPage' }
  | { name: 'documents' }
  | { name: 'document'; id: string }
  | { name: 'perform'; docId: string; index: number }
  | { name: 'import' }
  | { name: 'tags' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  switch (parts[0]) {
    case undefined:
    case 'library':
      return { name: 'library' };
    case 'page':
      return parts[1] === 'new' || parts[1] === undefined
        ? { name: 'newPage' }
        : { name: 'page', id: parts[1] };
    case 'documents':
      return { name: 'documents' };
    case 'doc':
      return parts[1] ? { name: 'document', id: parts[1] } : { name: 'documents' };
    case 'perform': {
      if (!parts[1]) return { name: 'documents' };
      const index = Number.parseInt(parts[2] ?? '0', 10);
      return { name: 'perform', docId: parts[1], index: Number.isFinite(index) ? index : 0 };
    }
    case 'import':
      return { name: 'import' };
    case 'tags':
      return { name: 'tags' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'library' };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'library':
      return '#/library';
    case 'newPage':
      return '#/page/new';
    case 'page':
      return `#/page/${encodeURIComponent(route.id)}`;
    case 'documents':
      return '#/documents';
    case 'document':
      return `#/doc/${encodeURIComponent(route.id)}`;
    case 'perform':
      return `#/perform/${encodeURIComponent(route.docId)}/${route.index}`;
    case 'import':
      return '#/import';
    case 'tags':
      return '#/tags';
    case 'settings':
      return '#/settings';
  }
}

export function navigate(route: Route, replace = false): void {
  const href = hrefFor(route);
  if (replace) {
    history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = href;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** Back, falling back to a sensible parent when the app was opened straight onto a deep link. */
export function goBack(fallback: Route): void {
  if (history.length > 1) history.back();
  else navigate(fallback, true);
}
