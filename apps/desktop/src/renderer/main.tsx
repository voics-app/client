import './infrastructure/storage/installBrowserStorage';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import './interface/shared/theme/base.css';
import './interface/shared/theme/ui.css';
import './interface/shared/theme/app.css';
import './interface/shared/theme/access.css';
import { App } from './interface/app/App';
import { Gallery } from './interface/features/gallery/Gallery';
import { usePrefsStore } from './application/stores/prefsStore';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

const GALLERY_HASH = '#/__gallery';

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Switches between the app and the visual review gallery (`#/__gallery`) without a reload,
 * because the main process blocks in-window navigation. */
function Root() {
  const isGallery = useSyncExternalStore(subscribeToHash, () => window.location.hash === GALLERY_HASH);
  if (!isGallery) return <App />;
  const { theme, accent } = usePrefsStore.getState();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  return <Gallery />;
}

createRoot(root).render(<StrictMode><Root /></StrictMode>);
