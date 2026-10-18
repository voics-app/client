import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './interface/shared/theme/base.css';
import './interface/shared/theme/ui.css';
import './interface/shared/theme/app.css';
import { App } from './interface/app/App';
import { Gallery } from './interface/features/gallery/Gallery';
import { usePrefsStore } from './application/stores/prefsStore';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

if (window.location.hash === '#/__gallery') {
  const { theme, accent } = usePrefsStore.getState();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  createRoot(root).render(<StrictMode><Gallery /></StrictMode>);
} else {
  createRoot(root).render(<StrictMode><App /></StrictMode>);
}
