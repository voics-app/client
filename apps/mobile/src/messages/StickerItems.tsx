import { Image, StyleSheet, Text, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import type { StickerItem } from '@discordy/core/contracts/rest';
import { BRAND } from '../brand';
import { theme } from '../theme';

/** Static images render natively; unsupported or paused animation stays visible as text. */
export function StickerItems({ items }: { items: StickerItem[] | undefined }) {
  const animate = usePrefsStore((state) => state.animateStickers);
  if (!items?.length) return null;
  return <View style={styles.list}>{items.map((item) => {
    const unsupported = item.format_type === 3 || (item.format_type !== 1 && !animate);
    return unsupported ? <Text key={item.id} accessibilityLabel={`Sticker: ${item.name}`} style={styles.label}>{`Sticker: ${item.name}`}</Text> : <Image key={item.id} accessibilityLabel={`Sticker: ${item.name}`} source={{ uri: `${BRAND.cdnUrl}/stickers/${item.id}.${item.format_type === 4 ? 'gif' : 'png'}` }} style={styles.image} />;
  })}</View>;
}
const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  image: { width: 160, height: 160, resizeMode: 'contain' },
  label: { color: theme.muted, paddingVertical: 8 },
});
