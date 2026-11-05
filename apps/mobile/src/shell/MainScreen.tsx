import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type View as ViewState } from '@discordy/core/application/stores/uiStore';
import { theme } from '../theme';
import { Sidebar } from './Sidebar';
import { useWideLayout } from './layoutModel';
import { useSelectView } from './useSelectView';

/** Desktop's Shell, without the stage: the server rail and the column of the selected server (or the DM list), with the user panel at its foot. Chats open full screen over it. On a tablet the sidebar is always on screen beside the stack (see WideShell), so this route only asks for a chat. */
export function MainScreen({ select }: { select?: ViewState }) {
  useSelectView(select);
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <View testID="chat-placeholder" style={styles.placeholder}>
        <Text style={styles.placeholderText}>Pick a channel or conversation to start.</Text>
      </View>
    );
  }
  return (
    <View testID="main-screen" style={[styles.shell, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <Sidebar bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: theme.background },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  placeholderText: { color: theme.subtle, fontSize: 15, textAlign: 'center' },
});
