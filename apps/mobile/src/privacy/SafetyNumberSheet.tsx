import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { BottomSheet } from '../sheets/BottomSheet';
import { getRuntime } from '../runtime';
import { theme } from '../theme';

/** The safety number of a direct chat: six groups of five digits both people can compare over another channel. */
export function SafetyNumberSheet({ peerId, onClose }: { peerId: string | null; onClose(): void }) {
  const [groups, setGroups] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!peerId) return;
    let alive = true;
    setGroups(null);
    setError(null);
    const runtime = getRuntime();
    void runtime.api
      .listUserDevices(peerId)
      .then((devices) => {
        const first = devices[0];
        if (!first || !runtime.privacy) throw new Error('This person has no encryption-capable device yet.');
        return runtime.privacy.p2p.safetyNumber(peerId, first.device_id);
      })
      .then((digits) => alive && setGroups(digits))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [peerId]);
  return (
    <BottomSheet visible={peerId !== null} onClose={onClose} label="Safety number">
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>
          Safety number
        </Text>
        {groups ? (
          <Text selectable style={styles.number}>
            {groups.join('  ')}
          </Text>
        ) : (
          <Text style={styles.hint}>{error ?? 'Computing'}</Text>
        )}
        <Text style={styles.hint}>Compare this number with theirs over another channel. If it matches, no one is intercepting your encrypted chats.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  number: { color: theme.text, fontSize: 20, fontWeight: '600', letterSpacing: 1, fontVariant: ['tabular-nums'], lineHeight: 30 },
  hint: { color: theme.muted, fontSize: 14 },
});
