import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { callerOf, ringingCallFor } from '@discordy/core/domain/calls';
import { dmTitle } from '../dms/dmModel';
import { Avatar } from '../profile/Avatar';
import { metrics, theme } from '../theme';
import { acceptCall, declineCall, voiceAvailable } from './voiceActions';

/**
 * A DM or group call that is ringing for you: the caller, Accept and Decline. It appears over every screen while the app is open
 * (a ring while the app is closed needs CallKit and PushKit, which come later). Without native voice there is nothing to answer with, so it stays hidden.
 */
export function IncomingCall() {
  const me = useSessionStore((s) => s.user?.id);
  const calls = useCallStore((s) => s.calls);
  const channels = useGuildStore((s) => s.channels);
  const relationships = useRelationshipStore((s) => s.byUser);
  const insets = useSafeAreaInsets();
  if (!me || !voiceAvailable()) return null;
  const call = ringingCallFor(calls, me);
  const channel = call ? channels[call.channelId] : undefined;
  if (!call) return null;

  const callerId = callerOf(call, me);
  const caller = channel?.recipients?.find((u) => u.id === callerId) ?? channel?.recipients?.[0];
  const title = channel ? dmTitle(channel, relationships) : 'Incoming call';
  return (
    <View accessibilityLiveRegion="assertive" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.card}>
        {caller && <Avatar user={caller} size={44} />}
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text style={styles.sub}>Incoming voice call</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Decline call" onPress={() => declineCall(call.channelId)} style={[styles.action, styles.decline]}>
          <Ionicons name="call" size={22} color={theme.accentText} style={styles.hangup} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Accept call" onPress={() => acceptCall(call.channelId)} style={[styles.action, styles.accept]}>
          <Ionicons name="call" size={22} color={theme.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: metrics.panelRadius, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairlineStrong },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.text, fontSize: 15, fontWeight: '600' },
  sub: { color: theme.muted, fontSize: 12 },
  action: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  decline: { backgroundColor: theme.danger },
  accept: { backgroundColor: theme.success },
  hangup: { transform: [{ rotate: '135deg' }] },
});
