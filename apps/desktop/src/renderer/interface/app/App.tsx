import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { AuthScreen } from '../features/auth/AuthScreen';
import { CommandPalette } from '../features/palette/CommandPalette';
import { DialogHost } from '../features/shell/DialogHost';
import { IncomingCallHost } from '../features/calls/IncomingCall';
import { Shell } from '../features/shell/Shell';
import { SettingsHost } from '../features/settings/SettingsHost';
import { Toasts } from '../shared/ui/Toasts';
import { Lightbox } from '../features/chat/Lightbox';
import { Spinner } from '../shared/ui/Spinner';
import { bridge, loadAppInfo } from './bridge';
import { useActivityReporting } from './activity';
import { useGlobalShortcuts } from './shortcuts';
import { createRuntime, type Runtime } from './runtime';
import { flushPendingRoute, handleRoute } from './navigation';
import { registerEngines } from './engines';
import { BRAND } from '@shared/brand';

/** Applies theme, accent, motion and density preferences to the document root. */
function useAppearance(): void {
  const theme = usePrefsStore((s) => s.theme);
  const accent = usePrefsStore((s) => s.accent);
  const reduce = usePrefsStore((s) => s.reduceMotion);
  const scale = usePrefsStore((s) => s.fontScale);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.dataset.reduceMotion = String(reduce);
    root.style.setProperty('--font-scale', String(scale));
  }, [theme, accent, reduce, scale]);
}

function Boot({ message }: { message: string }) {
  return (
    <div className="boot" role="status">
      <span className="brand-mark is-large" aria-hidden="true" />
      <Spinner size={20} />
      <p>{message}</p>
    </div>
  );
}

export function App() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const status = useSessionStore((s) => s.status);
  useAppearance();
  useGlobalShortcuts();
  useActivityReporting();

  useEffect(() => {
    let alive = true;
    void loadAppInfo()
      .then(async (info) => {
        const rt = createRuntime(info);
        // StrictMode runs this effect twice in dev; only the surviving runtime gets the engines.
        if (!alive) return;
        registerEngines(rt);
        setRuntime(rt);
        await rt.session.boot();
      })
      .catch((e: unknown) => alive && setFailure(e instanceof Error ? e.message : 'Failed to start'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const off = bridge?.app.onNavigate(handleRoute);
    // Pull any link that launched the app before this listener existed (cold start).
    void bridge?.app.takePendingRoute().then((route) => route && handleRoute(route));
    return off;
  }, []);
  useEffect(() => {
    if (status === 'ready') flushPendingRoute();
  }, [status]);

  if (failure) return <Boot message={failure} />;
  if (!runtime) return <Boot message={`Starting ${BRAND.displayName}`} />;

  return (
    <QueryClientProvider client={runtime.queryClient}>
      {status === 'booting' ? (
        <Boot message="Restoring your session" />
      ) : status === 'signedOut' ? (
        <AuthScreen />
      ) : status === 'connecting' ? (
        <Boot message="Connecting" />
      ) : (
        <>
          <Shell />
          <IncomingCallHost />
          <DialogHost />
          <SettingsHost />
          <Lightbox />
        </>
      )}
      <CommandPalette />
      <Toasts />
    </QueryClientProvider>
  );
}
