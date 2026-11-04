import { useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { assetCandidates } from '@discordy/core/domain/assets';
import { BRAND } from '../brand';
import { theme } from '../theme';
import { initialsOf } from './railModel';

/** A server's icon from the CDN; its initials when there is none or it fails to load. */
export function ServerIcon({ guild, active = false }: { guild: { id: string; name: string; icon: string | null }; active?: boolean }) {
  const uris = guild.icon && BRAND.cdnUrl ? assetCandidates(BRAND.cdnUrl, 'icons', guild.id, guild.icon, 96) : [];
  const [failed, setFailed] = useState(0);
  const uri = uris[failed];
  return uri ? (
    <Image accessibilityIgnoresInvertColors source={{ uri }} onError={() => setFailed((n) => n + 1)} style={styles.image} />
  ) : (
    <Text style={[styles.initials, active && styles.initialsActive]}>{initialsOf(guild.name).slice(0, 3)}</Text>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  initials: { color: theme.muted, fontSize: 15, fontWeight: '600', letterSpacing: -0.3 },
  initialsActive: { color: theme.accentText },
});
