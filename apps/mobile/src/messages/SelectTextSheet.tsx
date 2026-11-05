import { ScrollView, StyleSheet } from 'react-native';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { MarkdownText } from './markdown/MarkdownText';

/** A message in a sheet where the text can be selected natively (long press, drag handles, system Copy and Look Up); links and mentions stay tappable. */
export function SelectTextSheet({ message: current, onClose }: { message: ChatMessage | null; onClose(): void }) {
  const message = useLastValue(current);
  return (
    <BottomSheet visible={current !== null} onClose={onClose} label="Select text" tall>
      <ScrollView contentContainerStyle={styles.body}>
        <MarkdownText source={message?.content ?? ''} selectable fontSize={17} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 16 },
});
