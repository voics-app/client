import { StyleSheet, View } from 'react-native';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { QuickSwitcher } from '../switcher/QuickSwitcher';
import { metrics, theme } from '../theme';
import { VoiceBar } from '../voice/VoiceBar';
import { ChannelColumn } from './ChannelColumn';
import { DmColumn } from './DmColumn';
import { ServerRail } from './ServerRail';
import { UserPanel } from './UserPanel';
import { WIDE_COLUMN_WIDTH } from './layoutModel';

/** The server rail and the column of the selected server (or the DM list) with the voice bar and the user panel at its foot. On a phone the column takes the rest of the width; on a tablet it keeps a fixed width beside the chat. */
export function Sidebar({ fixedColumn = false, bottomInset = 0 }: { fixedColumn?: boolean; bottomInset?: number }) {
  const view = useUiStore((s) => s.view);
  return (
    <>
      <ServerRail />
      <View style={[styles.column, fixedColumn && { flex: 0, width: WIDE_COLUMN_WIDTH }, { paddingBottom: bottomInset }]}>
        {view.kind === 'guild' ? <ChannelColumn guildId={view.guildId} /> : <DmColumn />}
        <VoiceBar />
        <UserPanel />
        <QuickSwitcher />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, backgroundColor: theme.surface, borderTopLeftRadius: metrics.columnRadius },
});
