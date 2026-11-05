import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Attachment } from '@discordy/core/contracts/rest';
import { previewKind, displayFilename } from '@discordy/core/domain/media';
import { theme } from '../../theme';

/** Full-screen viewer for the images and videos of a message: swipe between them, pinch to zoom an image, tap Close to leave. */
export function MediaViewer({ items, index, onClose }: { items: Attachment[]; index: number | null; onClose(): void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const list = useRef<FlatList<Attachment>>(null);
  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);
  if (index === null) return null;
  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <FlatList
          ref={list}
          horizontal
          pagingEnabled
          data={items}
          keyExtractor={(a) => a.id}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (previewKind(item) === 'video' ? <VideoPage attachment={item} width={width} height={height} active={i === current} /> : <ImagePage attachment={item} width={width} height={height} />)}
        />
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Close viewer" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={26} color={theme.text} />
          </Pressable>
          <Text style={styles.count} numberOfLines={1}>
            {items.length > 1 ? `${current + 1} of ${items.length}  ` : ''}
            {displayFilename(items[current]?.filename ?? '')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function ImagePage({ attachment, width, height }: { attachment: Attachment; width: number; height: number }) {
  return (
    <ScrollView style={{ width, height }} contentContainerStyle={styles.page} maximumZoomScale={4} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
      <Image accessibilityLabel={attachment.description || attachment.filename} source={{ uri: attachment.url }} contentFit="contain" style={{ width, height }} />
    </ScrollView>
  );
}

function VideoPage({ attachment, width, height, active }: { attachment: Attachment; width: number; height: number; active: boolean }) {
  const player = useVideoPlayer(attachment.url);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={[styles.page, { width, height }]}>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width, height: height * 0.8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  page: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { flex: 1, color: theme.text, fontSize: 14 },
});
