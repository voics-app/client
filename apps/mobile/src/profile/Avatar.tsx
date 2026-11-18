import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { profileImageCandidates } from '@discordy/core/domain/profile';
import { BRAND } from '../brand';
import { theme } from '../theme';
import { avatarUris } from './profileModel';

/** A user's avatar from the CDN, falling back to their initial when there is no picture or it fails to load. */
export function Avatar({ user, size, guildId, member }: { user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>; size: number; guildId?: string | null; member?: GuildMember }) {
  const stored = useGuildStore((s) => guildId ? s.members[guildId]?.[user.id] : undefined);
  const uris = guildId ? profileImageCandidates(BRAND.cdnUrl, user, 'avatars', stored ?? member, guildId, size * 2) : avatarUris(BRAND.cdnUrl, user, size * 2);
  return <AvatarImage key={uris.join('\n')} uris={uris} size={size} name={user.global_name || user.username} />;
}

function AvatarImage({ uris, size, name }: { uris: string[]; size: number; name: string }) {
  const [failed, setFailed] = useState(0);
  const uri = uris[failed];
  return uri ? (
    <Image accessibilityLabel={`${name} avatar`} source={{ uri }} onError={() => setFailed((n) => n + 1)} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.initial, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initialText, { fontSize: size / 2 }]}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: theme.text, fontWeight: '700' },
});
