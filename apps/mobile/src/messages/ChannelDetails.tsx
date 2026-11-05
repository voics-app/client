import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel, User } from '@discordy/core/contracts/rest';
import { channelLink } from '@discordy/core/domain/channelMenuModel';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { Sheet, SheetOption } from '../ui/Sheet';

export interface ChannelDetailsProps {
  visible: boolean;
  channel: Channel | undefined;
  /** The title as the header shows it. */
  title: string;
  guildId: string | undefined;
  onClose(): void;
  onOpenPins(): void;
  onOpenSearch(): void;
  onOpenMembers(): void;
  /** Set where the channel can have threads (a server text or announcement channel). */
  onOpenThreads?: (() => void) | undefined;
  onOpenProfile(user: User): void;
  /** Extra rows (threads, search) that the chat screen owns. */
  children?: React.ReactNode;
}

const icon = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={theme.text} />;

/** What tapping the chat title opens, as in Discord's iOS app: the channel's name and topic, then Pinned messages, the member list (or a group's people) and Copy link. */
export function ChannelDetails({ visible, channel, title, guildId, onClose, onOpenPins, onOpenSearch, onOpenMembers, onOpenThreads, onOpenProfile, children }: ChannelDetailsProps) {
  const people = !guildId ? (channel?.recipients ?? []) : [];
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Sheet visible={visible} closeLabel="Close channel details" onClose={onClose}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {channel?.topic ? <Text style={styles.topic}>{channel.topic}</Text> : null}
      </View>
      <SheetOption label="Search" icon={icon('search-outline')} onPress={run(onOpenSearch)} />
      <SheetOption label="Pinned messages" icon={icon('pin-outline')} onPress={run(onOpenPins)} />
      {onOpenThreads && <SheetOption label="Threads" icon={icon('chatbubbles-outline')} onPress={run(onOpenThreads)} />}
      {guildId && <SheetOption label="Members" icon={icon('people-outline')} onPress={run(onOpenMembers)} />}
      {children}
      {channel && (
        <SheetOption
          label="Copy link"
          icon={icon('link-outline')}
          onPress={run(() => void Clipboard.setStringAsync(channelLink(guildId, channel.id)).catch(() => undefined))}
        />
      )}
      {people.length > 0 && (
        <View>
          <Text style={styles.section}>{`Members - ${people.length + 1}`}</Text>
          {people.map((user) => (
            <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`Profile of ${user.global_name || user.username}`} onPress={run(() => onOpenProfile(user))} style={styles.person}>
              <Avatar user={user} size={32} />
              <Text style={styles.personName}>{user.global_name || user.username}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700' },
  topic: { color: theme.muted, fontSize: 15, marginTop: 6 },
  section: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20 },
  personName: { color: theme.text, fontSize: 16 },
});
