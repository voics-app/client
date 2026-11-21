import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { parseStickerLottie, type StickerLottie } from '@discordy/core/domain/stickerAsset';
import type { StickerItem } from '@discordy/core/contracts/rest';
import { BRAND } from '../brand';
import { theme } from '../theme';

function LottieSticker({ item, size, animate }: { item: StickerItem; size: number; animate: boolean }) {
  const [data, setData] = useState<StickerLottie | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const builtin = item.id === '1' || item.id === '2' || item.id === '3';
    const url = builtin ? `${BRAND.apiUrl}/api/v1/stickers/${item.id}/asset` : `${BRAND.cdnUrl}/stickers/${item.id}.json`;
    setData(null); setFailed(false);
    void fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('Sticker unavailable');
      return response.text();
    }).then((source) => { if (!controller.signal.aborted) setData(parseStickerLottie(source)); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [item.id]);
  if (!data || failed) return <Text accessibilityLabel={`Sticker: ${item.name}`} style={styles.label}>{`Sticker: ${item.name}`}</Text>;
  return <View accessible accessibilityLabel={`Sticker: ${item.name}`}><LottieView testID="sticker-lottie" key={`${item.id}-${animate}`} source={data} autoPlay={animate} loop={animate} {...(!animate ? { progress: 0 } : {})} onAnimationFailure={() => setFailed(true)} enableSafeModeAndroid style={{ width: size, height: size }} /></View>;
}

export function StickerItems({ items, size = 160 }: { items: StickerItem[] | undefined; size?: number }) {
  const animate = usePrefsStore((state) => state.animateStickers);
  if (!items?.length) return null;
  return <View style={styles.list}>{items.map((item) => {
    if (item.format_type === 3) return <LottieSticker key={item.id} item={item} size={size} animate={animate} />;
    if (item.format_type !== 1 && !animate) return <Text key={item.id} accessibilityLabel={`Sticker: ${item.name}`} style={styles.label}>{`Sticker: ${item.name}`}</Text>;
    return <Image key={item.id} accessibilityLabel={`Sticker: ${item.name}`} source={{ uri: `${BRAND.cdnUrl}/stickers/${item.id}.${item.format_type === 4 ? 'gif' : 'png'}` }} style={[styles.image, { width: size, height: size }]} />;
  })}</View>;
}
const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  image: { resizeMode: 'contain' },
  label: { color: theme.muted, paddingVertical: 8 },
});
