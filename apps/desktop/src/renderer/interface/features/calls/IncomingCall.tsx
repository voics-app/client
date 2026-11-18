import { getI18n, useI18n } from '../../shared/i18n';
import { useEffect } from 'react';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { usersInChannel, useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { VoiceSounds } from '@renderer/application/voice/voiceSounds';
import type { VoiceSoundSnapshot } from '@discordy/core/domain/sounds';
import { soundEffects } from '@renderer/infrastructure/audio/sfx';
import { CallRinger } from '@renderer/application/calls/callRinger';
import { callerOf, isRingingFor, type DmCall } from '@discordy/core/domain/calls';
import { OUTGOING_RINGBACK, Ringtone } from '@renderer/infrastructure/audio/ringtone';
import { installAudioUnlock } from '@renderer/infrastructure/audio/sharedContext';
import { bridge } from '../../app/bridge';
import { acceptCall, declineCall } from '../../app/callActions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';

const ringer = new CallRinger({
  ringtone: new Ringtone(),
  ringback: new Ringtone(OUTGOING_RINGBACK),
  settings: () => {
    const prefs = usePrefsStore.getState();
    return {
      notifySounds: prefs.notifySounds,
      notifyDesktop: prefs.notifyDesktop,
      deafened: useVoiceStore.getState().selfDeaf,
      outputDeviceId: prefs.outputDeviceId,
      focused: document.hasFocus(),
      ringtone: prefs.ringtone,
      ringtoneVolume: prefs.ringtoneVolume,
    };
  },
  notify: (call, callerId) => {
    const caller = useGuildStore.getState().channels[call.channelId]?.recipients?.find((u) => u.id === callerId);
    const intl = getI18n();
    const name = caller ? displayName(caller) : intl.catalogText('Someone');
    bridge?.app.notify({
      title: intl.t('call.isCalling', { name }),
      body: intl.catalogText('Incoming call'),
      route: `/channels/@me/${call.channelId}`,
      silent: !usePrefsStore.getState().notifySounds,
    });
  },
});

const voiceSounds = new VoiceSounds({
  play: (sound) => soundEffects.play(sound, usePrefsStore.getState().outputVolume, usePrefsStore.getState().outputDeviceId),
  policy: () => ({
    enabled: usePrefsStore.getState().notifySounds,
    toggles: usePrefsStore.getState().soundToggles,
    doNotDisturb: useSessionStore.getState().settings.status === 'dnd',
  }),
});

function voiceSnapshot(): VoiceSoundSnapshot {
  const { call, states, selfMute, selfDeaf } = useVoiceStore.getState();
  const me = useSessionStore.getState().user?.id;
  const connected = call.status === 'connected' && call.channelId !== null;
  const others = connected && call.channelId ? usersInChannel(states, call.guildId ?? call.channelId, call.channelId).map((v) => v.user_id).filter((id) => id !== me) : [];
  return { connected, channelId: call.channelId, others, selfMute, selfDeaf };
}

function useVoiceSounds(): void {
  useEffect(() => {
    // Seed with the current state so mounting never plays a sound.
    voiceSounds.update(voiceSnapshot());
    return useVoiceStore.subscribe(() => voiceSounds.update(voiceSnapshot()));
  }, []);
}

function useCallRinging(): void {
  useEffect(() => {
    const sync = () => {
      const me = useSessionStore.getState().user?.id ?? null;
      ringer.update(useCallStore.getState().calls, me);
    };
    sync();
    const unsubscribers = [
      useCallStore.subscribe(sync),
      useSessionStore.subscribe(sync),
      useVoiceStore.subscribe(sync),
      usePrefsStore.subscribe(sync),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      ringer.stop();
    };
  }, []);
}

/** The incoming-call prompt for the first DM call ringing for the user; also drives the ringtone. */
export function IncomingCallHost() {
  const { t: msg } = useI18n();
  useCallRinging();
  useVoiceSounds();
  useEffect(() => installAudioUnlock(), []);
  const calls = useCallStore((s) => s.calls);
  const me = useSessionStore((s) => s.user?.id ?? null);
  const channels = useGuildStore((s) => s.channels);
  const incoming: DmCall | undefined = me ? Object.values(calls).find((call) => isRingingFor(call, me)) : undefined;
  if (!incoming || !me) return null;

  const channel = channels[incoming.channelId];
  const callerId = callerOf(incoming, me);
  const caller = channel?.recipients?.find((u) => u.id === callerId);
  const name = caller ? displayName(caller) : msg("chat.someone");
  return (
    <section className="incoming-call glass" role="alertdialog" aria-label={msg('call.incomingFrom', { name })} aria-live="assertive">
      <Avatar id={callerId ?? incoming.channelId} name={name} avatar={caller?.avatar ?? null} size={44} />
      <div className="incoming-call-copy">
        <p className="incoming-call-title">{msg('call.isCalling', { name })}</p>
        <p className="incoming-call-body">{msg("settings.incomingcall.incoming.voice.call")}</p>
      </div>
      <div className="incoming-call-actions">
        <button type="button" className="incoming-call-decline" onClick={() => declineCall(incoming.channelId)}>
          {msg("settings.incomingcall.decline")} </button>
        <button type="button" className="incoming-call-accept" onClick={() => acceptCall(incoming.channelId)}>
          {msg("common.accept")} </button>
      </div>
    </section>
  );
}
