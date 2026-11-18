import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { joinVoice, leaveVoice, switchCamera, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare, voiceAvailable } from './voiceActions';
import type { CameraFacing, NativeVideoStream } from './nativeVoice';
import { buildTiles, stageView } from './stageModel';
import { VoiceStage } from './VoiceStage';
import { VOICE_UNAVAILABLE } from './VoiceChannelScreen';
import { callHeadline, type ParticipantRow } from './voiceModel';
import { getRuntime } from '../runtime';
import { useCallInfo } from './useCallInfo';

function Participant({ row }: { row: ParticipantRow }) {
  return (
    <View accessibilityLabel={`${row.name}${row.self ? ', you' : ''}${row.muted ? ', muted' : ''}${row.speaking ? ', speaking' : ''}`} style={styles.person}>
      <View testID={row.speaking ? 'speaking-ring' : undefined} style={[styles.ring, row.speaking && styles.ringOn]}>
        <Avatar user={row.user} size={56} />
      </View>
      <View style={styles.personText}>
        <Text numberOfLines={1} style={styles.personName}>
          {row.name}
          {row.self ? ' (you)' : ''}
        </Text>
      </View>
      {row.deafened ? (
        <Ionicons name="volume-mute" size={18} color={theme.danger} />
      ) : row.muted ? (
        <Ionicons name="mic-off" size={18} color={theme.danger} />
      ) : null}
    </View>
  );
}

function ControlButton({ icon, label, onPress, on, danger, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void; on?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.control, on && styles.controlOn, danger && styles.controlDanger, disabled && styles.controlOff, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color={danger ? theme.accentText : on ? theme.background : theme.text} />
    </Pressable>
  );
}

/** Reads the audio route (speaker or earpiece) of the running voice stack. */
function useRoute() {
  const route = getRuntime().voice?.route;
  const subscribe = route?.subscribe ?? (() => () => undefined);
  const current = useSyncExternalStore(subscribe, () => route?.current ?? 'speaker');
  return { current, toggle: () => route?.toggle() };
}

const IN_CALL = new Set(['requesting', 'connecting', 'connected', 'reconnecting']);

/** The call state belongs to this screen's channel and is running. */
function callIsHere(status: string, callChannel: string | null, channelId: string): boolean {
  return IN_CALL.has(status) && callChannel === channelId;
}

/** Which camera is sending, from the voice stack; the front camera is the default. */
function useFacing(): CameraFacing {
  const controller = getRuntime().voice?.controller;
  const subscribe = controller?.subscribeFacing ?? (() => () => undefined);
  return useSyncExternalStore(subscribe, () => controller?.facing ?? 'front');
}

/** The call screen of a voice channel or DM call: who is here and who is speaking, their video, and mute, camera, deafen, speaker and leave. It joins when it opens. */
export function VoiceScreen({ channelId }: { channelId: string }) {
  const info = useCallInfo(channelId);
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const remote = useVoiceStore((s) => s.remoteStreams);
  const localCamera = useVoiceStore((s) => s.localCamera);
  const localScreen = useVoiceStore((s) => s.localScreen);
  const screenSsrcs = useVoiceStore((s) => s.screenSsrcs);
  const watching = useVoiceStore((s) => s.watching);
  const focused = useVoiceStore((s) => s.focusedStream);
  const facing = useFacing();
  const route = useRoute();
  const { video } = useLocalSearchParams<{ video?: string }>();
  const videoRequested = useRef(video === '1');
  const insets = useSafeAreaInsets();
  const available = voiceAvailable();
  const share = getRuntime().voice?.controller.screenShare;
  const shareStatus = useSyncExternalStore(share?.subscribe ?? (() => () => undefined), () => share?.status ?? 'idle');

  useEffect(() => {
    if (available) void joinVoice(info.guildId, channelId);
    // Joining once per opened channel; a later guild change of the same channel id cannot happen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, available]);

  const connectedHere = call.channelId === channelId && call.status === 'connected';
  // A video call from a conversation turns the camera on once, as soon as the call is up.
  useEffect(() => {
    if (!connectedHere || !videoRequested.current) return;
    videoRequested.current = false;
    void toggleCamera();
  }, [connectedHere]);

  const view = useMemo(
    () => stageView(buildTiles({ rows: info.participants, remote, localCamera: localCamera as NativeVideoStream | null, localScreen: localScreen as NativeVideoStream | null, screenKeys: Object.keys(screenSsrcs), watching }), focused),
    [info.participants, remote, localCamera, localScreen, screenSsrcs, watching, focused],
  );

  // A call that ends without the Leave button (hung up from the lock screen, the server disconnected you) closes this screen too.
  const wasInCall = useRef(false);
  const inCallHere = callIsHere(call.status, call.channelId, channelId);
  useEffect(() => {
    if (inCallHere) wasInCall.current = true;
    else if (wasInCall.current && call.status === 'idle') {
      wasInCall.current = false;
      router.back();
    }
  }, [inCallHere, call.status]);

  const leave = () => {
    wasInCall.current = false;
    void leaveVoice();
    router.back();
  };

  if (!available) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: info.title }} />
        <Text style={styles.notice}>{VOICE_UNAVAILABLE}</Text>
      </View>
    );
  }

  const here = call.channelId === channelId;
  const headline = here ? callHeadline(call) : 'Starting';
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <Stack.Screen options={{ title: info.title }} />
      <Text accessibilityRole="header" style={styles.headline}>
        {headline}
      </Text>
      {view.mode === 'list' ? (
        <FlatList
          data={info.participants}
          keyExtractor={(row) => row.userId}
          renderItem={({ item }) => <Participant row={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nobody is here yet.</Text>}
        />
      ) : (
        <VoiceStage view={view} facing={facing} onFocus={(key) => useVoiceStore.getState().focus(key)} />
      )}
      <View style={styles.controls}>
        <ControlButton icon={selfMute ? 'mic-off' : 'mic'} label={selfMute ? 'Unmute' : 'Mute'} on={selfMute} onPress={toggleMute} />
        <ControlButton icon={selfVideo ? 'videocam' : 'videocam-off'} label={selfVideo ? 'Turn camera off' : 'Turn camera on'} on={selfVideo} disabled={!connectedHere} onPress={() => void toggleCamera()} />
        {selfVideo && <ControlButton icon="camera-reverse" label={facing === 'front' ? 'Switch to back camera' : 'Switch to front camera'} onPress={switchCamera} />}
        {share?.available && <ControlButton icon="desktop-outline" label={shareStatus === 'starting' ? 'Cancel screen sharing' : shareStatus === 'sharing' ? 'Stop sharing screen' : 'Share screen'} on={shareStatus !== 'idle'} disabled={!connectedHere && shareStatus === 'idle'} onPress={toggleScreenShare} />}
        <ControlButton icon={selfDeaf ? 'volume-mute' : 'headset'} label={selfDeaf ? 'Undeafen' : 'Deafen'} on={selfDeaf} onPress={toggleDeafen} />
        <ControlButton
          icon={route.current === 'speaker' ? 'volume-high' : 'ear-outline'}
          label={route.current === 'speaker' ? 'Switch to earpiece' : 'Switch to speaker'}
          onPress={route.toggle}
        />
        <ControlButton icon="call" label="Leave voice" danger onPress={leave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  headline: { color: theme.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12, paddingHorizontal: 24 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  ring: { padding: 3, borderRadius: 32, borderWidth: 3, borderColor: 'transparent' },
  ringOn: { borderColor: theme.success },
  personText: { flex: 1 },
  personName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  empty: { color: theme.subtle, textAlign: 'center', padding: 32 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.hairline },
  control: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raised },
  controlOn: { backgroundColor: theme.text },
  controlOff: { opacity: 0.4 },
  controlDanger: { backgroundColor: theme.danger },
  pressed: { opacity: 0.7 },
  notice: { color: theme.muted, fontSize: 15, textAlign: 'center', padding: 32 },
});
