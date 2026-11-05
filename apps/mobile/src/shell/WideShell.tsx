import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Sidebar } from './Sidebar';

/**
 * The tablet layout: the rail and channel list stay on the left, and every screen of the stack (a chat, the member list, settings) opens in the pane on the right.
 * The pane's native headers add the top safe area themselves, so only the sidebar is padded here.
 */
export function WideShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="wide-shell" style={styles.shell}>
      <View style={[styles.sidebar, { paddingTop: insets.top, paddingLeft: insets.left }]}>
        <Sidebar fixedColumn bottomInset={insets.bottom} />
      </View>
      <View style={styles.pane}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: theme.background },
  sidebar: { flexDirection: 'row', backgroundColor: theme.background },
  pane: { flex: 1, borderLeftWidth: 1, borderLeftColor: theme.hairline },
});
