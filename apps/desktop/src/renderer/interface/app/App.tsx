import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { AuthScreen } from '../features/auth/AuthScreen';
import { CommandPalette } from '../features/palette/CommandPalette';
import { DialogHost } from '../features/shell/DialogHost';
import { IncomingCallHost } from '../features/calls/IncomingCall';
import { Shell } from '../features/shell/Shell';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { LazyFeature } from '../shared/ui/LazyFeature';

const loadSettings = () => import('../features/settings/SettingsHost').then(({ SettingsHost }) => ({ default: SettingsHost }));
import { Toasts } from '../shared/ui/Toasts';
import { Lightbox } from '../features/chat/Lightbox';
import { Spinner } from '../shared/ui/Spinner';
import { bridge, loadAppInfo } from './bridge';
import { useActivityReporting } from './activity';
import { useDesktopIntegration } from './desktopIntegration';
import { UpdateBanner } from '../features/updates/UpdateBanner';
import { useGlobalShortcuts } from './shortcuts';
import { startObsDetection, useStreamerActive } from './streamer';
import { useAppearance } from './appearance';
import { useWindowResizing } from '../shared/hooks/useWindowResizing';
import { createRuntime, type Runtime } from './runtime';
import { flushAuthLink, handleAuthRoute } from './authLinks';
import { flushPendingRoute, handleRoute } from './navigation';
import { registerEngines } from './engines';
import { BRAND } from '@shared/brand';
import { LocaleProvider, useI18n } from '../shared/i18n';

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
  return <LocaleProvider><AppContent /></LocaleProvider>;
}

function AppContent() {
  const { t, catalogText } = useI18n();
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const settings = useUiStore((s) => s.settings);
  const status = useSessionStore((s) => s.status);
  const streamer = useStreamerActive();
  useAppearance();
  useWindowResizing();
  useGlobalShortcuts();
  useActivityReporting();
  useDesktopIntegration();
  useEffect(() => startObsDetection(), []);
  useEffect(() => { if (streamer) window.speechSynthesis?.cancel(); }, [streamer]);

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
    const open = (route: string) => {
      if (!handleAuthRoute(route)) handleRoute(route);
    };
    const off = bridge?.app.onNavigate(open);
    // Pull any link that launched the app before this listener existed (cold start).
    void bridge?.app.takePendingRoute().then((route) => route && open(route));
    return off;
  }, []);
  useEffect(() => {
    if (status === 'ready') {
      flushAuthLink();
      flushPendingRoute();
    }
  }, [status]);

  if (failure) return <Boot message={catalogText(failure)} />;
  if (!runtime) return <Boot message={t('boot.starting', { app: BRAND.displayName })} />;

  return (
    <QueryClientProvider client={runtime.queryClient}>
      {status === 'booting' ? (
        <Boot message={t('boot.restoring')} />
      ) : status === 'signedOut' ? (
        <AuthScreen />
      ) : status === 'connecting' ? (
        <Boot message={t('boot.connecting')} />
      ) : (
        <>
          <Shell />
          <IncomingCallHost />
          <DialogHost />
          {settings && <LazyFeature load={loadSettings} props={{}} close={() => useUiStore.getState().openSettings(null)} />}
          <UpdateBanner />
          <Lightbox />
        </>
      )}
      <CommandPalette />
      <Toasts />
    </QueryClientProvider>
  );
}
