import { ScrollView, StyleSheet, Text } from 'react-native';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';

/** A message in a sheet where the text can be selected natively (long press, drag handles, system Copy and Look Up). */
export function SelectTextSheet({ message: current, onClose }: { message: ChatMessage | null; onClose(): void }) {
  const message = useLastValue(current);
  return (
    <BottomSheet visible={current !== null} onClose={onClose} label="Select text" tall>
      <ScrollView contentContainerStyle={styles.body}>
        <Text selectable style={styles.text}>
          {message?.content}
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 16 },
  text: { color: theme.text, fontSize: 17, lineHeight: 24 },
});
