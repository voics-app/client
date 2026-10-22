import { useEffect } from 'react';
import { useUpdateStore } from '@renderer/application/stores/updateStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { bridge } from './bridge';
import { toggleDeafen, toggleMute } from './voiceActions';

/** Wires the Electron shell: tray mute/deafen commands in, self voice state and update status out. */
export function useDesktopIntegration(): void {
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
    return () => {
      offVoice();
      offTray();
      offUpdates();
    };
  }, []);
}
