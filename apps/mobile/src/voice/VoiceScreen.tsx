import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { joinVoice, leaveVoice, toggleDeafen, toggleMute, VOICE_UNAVAILABLE, voiceAvailable } from './voiceActions';
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

function ControlButton({ icon, label, onPress, on, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void; on?: boolean; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.control, on && styles.controlOn, danger && styles.controlDanger, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={26} color={danger ? theme.accentText : on ? theme.background : theme.text} />
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

/** The call screen of a voice channel or DM call: who is here, who is speaking, and mute, deafen, speaker and leave. It joins when it opens. */
export function VoiceScreen({ channelId }: { channelId: string }) {
  const info = useCallInfo(channelId);
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const available = voiceAvailable();

  useEffect(() => {
    if (available) void joinVoice(info.guildId, channelId);
    // Joining once per opened channel; a later guild change of the same channel id cannot happen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, available]);

  const leave = () => {
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
      <FlatList
        data={info.participants}
        keyExtractor={(row) => row.userId}
        renderItem={({ item }) => <Participant row={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nobody is here yet.</Text>}
      />
      <View style={styles.controls}>
        <ControlButton icon={selfMute ? 'mic-off' : 'mic'} label={selfMute ? 'Unmute' : 'Mute'} on={selfMute} onPress={toggleMute} />
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
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.hairline },
  control: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raised },
  controlOn: { backgroundColor: theme.text },
  controlDanger: { backgroundColor: theme.danger },
  pressed: { opacity: 0.7 },
  notice: { color: theme.muted, fontSize: 15, textAlign: 'center', padding: 32 },
});
