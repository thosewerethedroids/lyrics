import { hrefFor, useRoute } from './ui/router';
import type { Route } from './ui/router';
import { PrefsProvider } from './ui/prefs';
import { ToastProvider } from './ui/components/Toast';
import { SyncProvider } from './ui/sync';
import { ConflictDialog } from './ui/components/ConflictDialog';
import { LibraryView } from './ui/views/LibraryView';
import { PageEditorView } from './ui/views/PageEditorView';
import { DocumentsListView } from './ui/views/DocumentsListView';
import { DocumentView } from './ui/views/DocumentView';
import { ImportView } from './ui/views/ImportView';
import { PerformanceView } from './ui/views/PerformanceView';
import { TagsView } from './ui/views/TagsView';
import { SettingsView } from './ui/views/SettingsView';

const NAV: { route: Route; label: string; matches: Route['name'][] }[] = [
  { route: { name: 'library' }, label: 'Library', matches: ['library', 'page', 'newPage'] },
  { route: { name: 'documents' }, label: 'Documents', matches: ['documents', 'document', 'import'] },
  { route: { name: 'settings' }, label: 'Settings', matches: ['settings', 'tags'] },
];

export default function App() {
  const route = useRoute();

  return (
    <PrefsProvider>
      <ToastProvider>
        <SyncProvider>
          <Shell route={route} />
        </SyncProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}

function Shell({ route }: { route: Route }) {
  // Performance view takes the whole screen — no nav, no chrome, nothing but the song. The
  // conflict chooser is held back here too: a two-sided edit can wait until the song is over.
  if (route.name === 'perform') {
    return <PerformanceView docId={route.docId} index={route.index} />;
  }

  return (
    <div className="app">
      <main className="app__main">
        <ViewFor route={route} />
      </main>
      <nav className="shell-nav" aria-label="Views">
        {NAV.map((item) => (
          <a
            key={item.label}
            className="shell-nav__link"
            href={hrefFor(item.route)}
            aria-current={item.matches.includes(route.name) ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <ConflictDialog />
    </div>
  );
}

function ViewFor({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <LibraryView />;
    case 'newPage':
      return <PageEditorView />;
    case 'page':
      return <PageEditorView id={route.id} />;
    case 'settings':
      return <SettingsView />;
    case 'documents':
      return <DocumentsListView />;
    case 'document':
      return <DocumentView id={route.id} />;
    case 'import':
      return <ImportView />;
    case 'tags':
      return <TagsView />;
    default:
      return <LibraryView />;
  }
}

