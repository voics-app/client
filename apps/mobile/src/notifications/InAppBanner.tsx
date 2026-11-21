import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapLight } from '../haptics';
import { openMessage } from '../navigation/openMessage';
import { useReduceMotion } from '../sheets/useReduceMotion';
import { theme } from '../theme';
import { BANNER_MS, channelIdFromPath } from './bannerModel';
import { useBannerStore } from './bannerStore';
import { useChannelContentAccess } from '../safety/useChannelContentAccess';

/** A banner at the top of the screen for a new message while the user is elsewhere in the app. Tap opens the message; it goes away by itself. */
export function InAppBanner() {
  const { canShow } = useChannelContentAccess();
  const banner = useBannerStore((s) => s.banner);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const viewing = channelIdFromPath(pathname);
    useBannerStore.getState().setViewing(viewing);
    // Opening the chat the banner is about answers it.
    if (viewing && useBannerStore.getState().banner?.channelId === viewing) useBannerStore.getState().dismiss();
  }, [pathname]);

  useEffect(() => {
    if (!banner) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: reduceMotion ? 0 : 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => useBannerStore.getState().dismiss(), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, slide, reduceMotion]);

  if (!banner || !canShow(banner.channelId)) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8, opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}: ${banner.body}`}
        onPress={() => {
          tapLight();
          useBannerStore.getState().dismiss();
          openMessage({ guildId: banner.guildId, channelId: banner.channelId, messageId: banner.id });
        }}
        style={styles.card}
      >
        <Text numberOfLines={1} style={styles.title}>
          {banner.title}
        </Text>
        <Text numberOfLines={2} style={styles.body}>
          {banner.body}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => useBannerStore.getState().dismiss()} style={styles.close}>
        <Text style={styles.closeText}>x</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', backgroundColor: theme.raised, borderRadius: 14, borderWidth: 1, borderColor: theme.hairlineStrong },
  card: { flex: 1, minHeight: 56, paddingLeft: 14, paddingVertical: 10 },
  title: { color: theme.text, fontSize: 14, fontWeight: '700' },
  body: { color: theme.muted, fontSize: 14, marginTop: 1 },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: theme.subtle, fontSize: 18 },
});
