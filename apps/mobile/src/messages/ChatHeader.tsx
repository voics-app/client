import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '@discordy/core/contracts/rest';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { openCallScreen, voiceAvailable } from '../voice/voiceActions';

export const CALLS_NOTICE = "Calls aren't in this test version yet.";

const showCallsNotice = () => Alert.alert('Calls', CALLS_NOTICE);

/** The header title: `# name` in a server, the person's avatar and name in a direct message. With `onPress` it is a button (channel details, or the profile in a 1:1 DM). */
export function ChatHeaderTitle({ title, peer, onPress }: { title: string; peer: User | null; onPress?: () => void }) {
  const body = (
    <>
      {peer && <Avatar user={peer} size={28} />}
      <Text accessibilityRole="header" numberOfLines={1} style={styles.titleText}>
        {title}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} details`} onPress={onPress} style={[styles.title, styles.titleButton]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.title}>{body}</View>
  );
}

function HeaderButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button}>
      <Ionicons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

export interface ChatHeaderActionsProps {
  /** Opens the other person's profile; set only in a 1:1 direct message. */
  onProfile?: () => void;
  /** Direct and group conversations get call buttons; their notice says calls are not built yet. */
  calls: boolean;
  /** The right-most slot, where a channel's members button goes. */
  trailing?: ReactNode;
  /** Opens the channel menu (mark as read, mute, notifications, invite). */
  onMenu?: () => void;
}

export function ChatHeaderActions({ onProfile, calls, trailing, onMenu }: ChatHeaderActionsProps) {
  const { channelId } = useLocalSearchParams<{ channelId?: string }>();
  // Expo Go has no native WebRTC and keeps the notice; a development build starts the voice call.
  const call = (video: boolean) => {
    if (!voiceAvailable() || !channelId) showCallsNotice();
    else openCallScreen(channelId, { video });
  };
  return (
    <View style={styles.actions}>
      {calls && <HeaderButton icon="call-outline" label="Voice call" onPress={() => call(false)} />}
      {calls && <HeaderButton icon="videocam-outline" label="Video call" onPress={() => call(true)} />}
      {onProfile && <HeaderButton icon="person-circle-outline" label="View profile" onPress={onProfile} />}
      {trailing}
      {onMenu && <HeaderButton icon="ellipsis-horizontal" label="Channel menu" onPress={onMenu} />}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 220 },
  titleButton: { minHeight: 44 },
  titleText: { color: theme.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  button: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});
