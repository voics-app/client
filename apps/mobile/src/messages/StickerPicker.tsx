import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Sticker } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';
import { StickerItems } from './StickerItems';

export function StickerPicker({ visible, guildId, onClose, onPick }: { visible: boolean; guildId?: string | undefined; onClose(): void; onPick(item: Sticker): void }) {
  const [items, setItems] = useState<Sticker[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true); setError(false);
    void Promise.all([getRuntime().api.builtInStickers(), guildId ? getRuntime().api.guildStickers(guildId) : Promise.resolve([])])
      .then(([builtins, guild]) => { if (active) setItems([...builtins, ...guild]); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, guildId]);
  return <BottomSheet visible={visible} onClose={onClose} label="Stickers" tall>
    {loading ? <Text style={styles.message}>Loading stickers…</Text> : error ? <Text accessibilityRole="alert" style={styles.message}>Could not load stickers. Close and try again.</Text> : <ScrollView><View style={styles.grid}>
      {items.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`Send ${item.name}`} key={item.id} onPress={() => { onClose(); onPick(item); }} style={styles.cell}><StickerItems items={[item]} size={64} /></Pressable>)}
    </View></ScrollView>}
  </BottomSheet>;
}
const styles = StyleSheet.create({
  message: { color: theme.muted, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  cell: { minWidth: 100, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
});
