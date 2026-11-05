import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { tapLight } from '../haptics';
import { passesEdgeSwipe, EDGE_SWIPE_FAIL_Y, EDGE_SWIPE_START, EDGE_SWIPE_WIDTH } from './edgeSwipeModel';

/**
 * A thin strip along the right edge of a server chat: drag it leftwards and the member list slides in, the mirror of the back swipe on the left edge.
 * The strip sits above the messages, so their own swipe to reply never starts from it.
 */
export function MembersEdgeSwipe({ guildId }: { guildId: string }) {
  const open = () => {
    tapLight();
    router.push(`/servers/${guildId}/members`);
  };
  const pan = Gesture.Pan()
    .activeOffsetX(-EDGE_SWIPE_START)
    .failOffsetY([-EDGE_SWIPE_FAIL_Y, EDGE_SWIPE_FAIL_Y])
    .onEnd((e) => {
      if (passesEdgeSwipe(e.translationX, e.velocityX)) scheduleOnRN(open);
    });
  return (
    <GestureDetector gesture={pan}>
      <View testID="members-edge-swipe" style={styles.strip} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, bottom: 0, right: 0, width: EDGE_SWIPE_WIDTH },
});
