import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { Avatar } from '../profile/Avatar';
import { CHROME_FONT_CAP, radius, space, theme, type } from '../theme';
import { VideoSurface } from './VideoSurface';
import type { CameraFacing } from './nativeVoice';
import type { StageTileModel, StageView } from './stageModel';

const PIP = { width: 108, height: 144 } as const;
const STRIP = { width: 84, height: 112 } as const;

const tileName = (tile: StageTileModel): string => (tile.kind === 'screen' ? `${tile.row.name}'s screen` : tile.row.name);

interface TileProps {
  tile: StageTileModel;
  guildId?: string | null;
  facing: CameraFacing;
  onPress(): void;
  /** A small tile drawn over a large one. */
  overlay?: boolean;
  avatarSize?: number;
}

function TileLabel({ tile }: { tile: StageTileModel }) {
  const { row } = tile;
  return (
    <View style={styles.label}>
      {row.deafened ? <Ionicons name="volume-mute" size={14} color={theme.danger} /> : row.muted ? <Ionicons name="mic-off" size={14} color={theme.danger} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={CHROME_FONT_CAP} style={styles.labelText}>
        {tileName(tile)}
        {row.self && tile.kind !== 'screen' ? ' (you)' : ''}
      </Text>
    </View>
  );
}

function Tile({ tile, facing, onPress, overlay = false, avatarSize = 56, guildId }: TileProps) {
  const { row } = tile;
  const member = useVoiceStore((s) => guildId ? s.states[guildId]?.[row.userId]?.member : undefined);
  const watch = () => useVoiceStore.getState().watchStream(tile.key);
  const label = `${tileName(tile)}${row.self && tile.kind !== 'screen' ? ', you' : ''}${row.muted ? ', muted' : ''}${row.speaking ? ', speaking' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Video tile, ${label}`}
      accessibilityHint="Double tap to enlarge"
      onPress={onPress}
      style={[styles.tile, row.speaking && styles.speaking, overlay && styles.overlay]}
    >
      {tile.stream ? (
        <VideoSurface stream={tile.stream} mirror={row.self && facing === 'front' && tile.kind === 'camera'} fit={tile.kind === 'screen' ? 'contain' : 'cover'} overlay={overlay} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.center}>
          {tile.kind === 'screen' ? <Ionicons name="desktop-outline" size={avatarSize * 0.6} color={theme.subtle} /> : <Avatar user={row.user} size={avatarSize} guildId={guildId} member={member} />}
          {tile.watchable && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${row.name}'s screen`} onPress={watch} style={styles.watch}>
              <Text style={styles.watchText}>Watch</Text>
            </Pressable>
          )}
        </View>
      )}
      <TileLabel tile={tile} />
    </Pressable>
  );
}

/** The video part of a call: one to one with your own small tile, a grid for groups, or one large tile with a strip after a tap. */
export function VoiceStage({ view, facing, onFocus, guildId }: { view: Exclude<StageView, { mode: 'list' }>; facing: CameraFacing; onFocus(key: string | null): void; guildId?: string | null }) {
  const { width } = useWindowDimensions();
  if (view.mode === 'duo') {
    return (
      <View style={styles.stage}>
        <Tile tile={view.remote} facing={facing} guildId={guildId} avatarSize={96} onPress={() => onFocus(view.remote.key)} />
        <View style={styles.pip}>
          <Tile tile={view.self} facing={facing} guildId={guildId} overlay avatarSize={40} onPress={() => onFocus(view.self.key)} />
        </View>
      </View>
    );
  }
  if (view.mode === 'focus') {
    return (
      <View style={styles.stage}>
        <Tile tile={view.main} facing={facing} guildId={guildId} avatarSize={96} onPress={() => onFocus(null)} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
          {view.strip.map((tile) => (
            <View key={tile.key} style={STRIP}>
              <Tile tile={tile} facing={facing} guildId={guildId} overlay avatarSize={32} onPress={() => onFocus(tile.key)} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }
  const cell = (width - space[3] * 2 - space[2] * (view.columns - 1)) / view.columns;
  return (
    <ScrollView style={styles.stage} contentContainerStyle={styles.grid}>
      {view.tiles.map((tile) => (
        <View key={tile.key} style={{ width: cell, height: cell * 1.25 }}>
          <Tile tile={tile} facing={facing} guildId={guildId} avatarSize={64} onPress={() => onFocus(tile.key)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, margin: space[3], marginBottom: space[2] },
  tile: { flex: 1, borderRadius: radius.panel, overflow: 'hidden', backgroundColor: theme.raised, borderWidth: 2, borderColor: 'transparent' },
  speaking: { borderColor: theme.success },
  overlay: { borderColor: theme.hairline },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2] },
  label: { position: 'absolute', left: space[2], bottom: space[2], maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space[2], paddingVertical: 3, borderRadius: radius.chip, backgroundColor: 'rgba(0,0,0,0.55)' },
  labelText: { color: '#ffffff', fontSize: type.meta, fontWeight: '600' },
  watch: { minHeight: 36, paddingHorizontal: space[4], borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent },
  watchText: { color: theme.accentText, fontSize: type.small, fontWeight: '700' },
  pip: { position: 'absolute', right: space[2], bottom: space[2], width: PIP.width, height: PIP.height },
  strip: { position: 'absolute', left: 0, right: 0, bottom: space[2], maxHeight: STRIP.height },
  stripContent: { gap: space[2], paddingHorizontal: space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
