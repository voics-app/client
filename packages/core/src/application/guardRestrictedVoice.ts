import { canShowChannelContent } from './ageRestrictedAccess';
import { useAgeRestrictedStore } from './stores/ageRestrictedStore';
import { useGuildStore } from './stores/guildStore';
import { useSessionStore } from './stores/sessionStore';
import { useVoiceStore } from './stores/voiceStore';

/** Revocation must end an existing media session as well as unmount its screen. */
export function guardRestrictedVoice(leave: () => Promise<void>, onError: (error: unknown) => void): () => void {
  let leaving = false;
  const check = () => {
    const { call } = useVoiceStore.getState();
    if (leaving || !call.channelId || call.status === 'idle' || call.status === 'failed' || canShowChannelContent(call.channelId)) return;
    leaving = true;
    void leave().catch(onError).finally(() => { leaving = false; });
  };
  const stops = [useAgeRestrictedStore.subscribe(check), useGuildStore.subscribe(check), useSessionStore.subscribe(check), useVoiceStore.subscribe(check)];
  check();
  return () => stops.forEach((stop) => stop());
}
