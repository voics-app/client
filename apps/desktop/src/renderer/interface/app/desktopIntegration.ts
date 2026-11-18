import { useEffect } from 'react';
import { useUpdateStore } from '@discordy/core/application/stores/updateStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { isAutoIdle, manualStatus, setAutoIdle } from '@discordy/core/application/selfPresence';
import { IdleMonitor } from '@discordy/core/application/idleMonitor';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { isExpired } from '@discordy/core/domain/selfPresence';
import { bridge } from './bridge';
import { publishPresence } from './presenceActions';
import { setStatusText } from '../features/shell/customStatus';
import { toggleDeafen, toggleMute } from './voiceActions';
import { useI18n } from '../shared/i18n';

const IDLE_POLL_MS = 10_000;

/** Wires the Electron shell: tray mute/deafen commands in, self voice state and update status out. */
export function useDesktopIntegration(): void {
  const { locale } = useI18n();
  useEffect(() => { bridge?.app.setLocale?.(locale); }, [locale]);
  useEffect(() => {
    if (!bridge) return;
    const pushVoice = () => {
      const { selfMute, selfDeaf } = useVoiceStore.getState();
      bridge?.app.setVoiceState({ muted: selfMute, deafened: selfDeaf });
    };
    pushVoice();
    const offVoice = useVoiceStore.subscribe(pushVoice);
    const offTray = bridge.app.onTrayCommand((command) => void (command === 'toggleMute' ? toggleMute() : toggleDeafen()));
    const offUpdates = bridge.updates.onStatus((s) => useUpdateStore.getState().setStatus(s));
    const monitor = new IdleMonitor({
      idleSeconds: () => bridge!.idle.seconds(),
      timeoutMinutes: async () => (await bridge!.desktop.get()).idleTimeoutMinutes,
      manual: manualStatus,
      current: isAutoIdle,
      onChange: (idle) => {
        setAutoIdle(idle);
        if (useSessionStore.getState().status === 'ready') publishPresence();
      },
    });
    const poll = () => {
      if (useSessionStore.getState().status !== 'ready') return;
      void monitor.tick();
      if (isExpired(useSessionStore.getState().settings.custom_status, Date.now())) void setStatusText(null);
    };
    const timer = window.setInterval(poll, IDLE_POLL_MS);
    const offLock = bridge.idle.onLock((locked) => monitor.setLocked(locked));
    window.addEventListener('focus', poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
      offLock();
      offVoice();
      offTray();
      offUpdates();
    };
  }, []);
}
