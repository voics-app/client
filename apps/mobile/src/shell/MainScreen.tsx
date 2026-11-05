import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore, type View as ViewState } from '@discordy/core/application/stores/uiStore';
import { metrics, theme } from '../theme';
import { VoiceBar } from '../voice/VoiceBar';
import { ChannelColumn } from './ChannelColumn';
import { DmColumn } from './DmColumn';
import { ServerRail } from './ServerRail';
import { UserPanel } from './UserPanel';
import { useSelectView } from './useSelectView';

/** Desktop's Shell, without the stage: the server rail and the column of the selected server (or the DM list), with the user panel at its foot. Chats open full screen over it. */
export function MainScreen({ select }: { select?: ViewState }) {
  useSelectView(select);
  const view = useUiStore((s) => s.view);
  const insets = useSafeAreaInsets();
  return (
    <View testID="main-screen" style={[styles.shell, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <ServerRail />
      <View style={[styles.column, { paddingBottom: insets.bottom }]}>
        {view.kind === 'guild' ? <ChannelColumn guildId={view.guildId} /> : <DmColumn />}
        <VoiceBar />
        <UserPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: theme.background },
  column: { flex: 1, backgroundColor: theme.surface, borderTopLeftRadius: metrics.columnRadius },
});
