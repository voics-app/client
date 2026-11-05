import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { saveRail } from '@discordy/core/application/guildCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { GuildFolder } from '@discordy/core/contracts/rest';
import { FOLDER_COLORS, folderLabel, MAX_FOLDER_NAME, patchFolder } from '@discordy/core/domain/railLayout';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { Sheet, SheetOption } from '../ui/Sheet';
import { addToFolder, createFolder, folderOf, loneServers, removeFromFolder, stepFolder, stepGuild, ungroup } from './railEditModel';

export type RailTarget = { kind: 'guild'; id: string } | { kind: 'folder'; id: number };

type Step = 'menu' | 'addToFolder' | 'newFolder' | 'edit';

const icon = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={theme.text} />;
const colorHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

const save = (rail: GuildFolder[]) => attempt(() => saveRail(getRuntime().api, rail), 'Could not save server order');

function FolderEdit({ folder, onDone }: { folder: GuildFolder; onDone(): void }) {
  const [name, setName] = useState(folder.name ?? '');
  const rail = useGuildStore((s) => s.rail);
  return (
    <View style={styles.form}>
      <Field label="Folder name" value={name} maxLength={MAX_FOLDER_NAME} autoCapitalize="sentences" onChangeText={setName} />
      <View accessibilityRole="radiogroup" style={styles.swatches}>
        {FOLDER_COLORS.map((c) => (
          <Pressable key={c} accessibilityRole="radio" accessibilityLabel={`Folder colour ${colorHex(c)}`} accessibilityState={{ selected: folder.color === c }} onPress={() => void save(patchFolder(rail, folder.id!, { color: c }))} style={[styles.swatch, { backgroundColor: colorHex(c) }, folder.color === c && styles.swatchOn]} />
        ))}
      </View>
      <Button
        label="Save folder"
        tone="primary"
        onPress={() => {
          void save(patchFolder(rail, folder.id!, { name }));
          onDone();
        }}
      />
    </View>
  );
}

/**
 * The long-press menu of a server or folder in the rail, in place of dragging: move up and down, start or join a folder, take a server out of one,
 * and for a folder rename, colour and ungroup. Every change shows at once and syncs to your other devices (core `saveRail`).
 */
export function RailMenu({ target: shown, onClose }: { target: RailTarget | null; onClose(): void }) {
  const target = useLastValue(shown);
  const rail = useGuildStore((s) => s.rail);
  const guilds = useGuildStore((s) => s.guilds);
  const [step, setStep] = useState<Step>('menu');
  if (!target) return null;
  const close = () => {
    setStep('menu');
    onClose();
  };
  const apply = (next: GuildFolder[]) => {
    close();
    if (next !== rail) void save(next);
  };

  if (target.kind === 'folder') {
    const folder = rail.find((e) => e.id === target.id);
    if (!folder) return null;
    return (
      <Sheet visible={shown !== null} title={folderLabel(folder, (id) => guilds[id]?.name)} closeLabel="Close folder menu" onClose={close}>
        {step === 'edit' ? (
          <FolderEdit folder={folder} onDone={close} />
        ) : (
          <>
            <SheetOption label="Rename or colour folder" icon={icon('color-palette-outline')} onPress={() => setStep('edit')} />
            <SheetOption label="Move folder up" icon={icon('chevron-up')} onPress={() => apply(stepFolder(rail, folder.id!, -1))} />
            <SheetOption label="Move folder down" icon={icon('chevron-down')} onPress={() => apply(stepFolder(rail, folder.id!, 1))} />
            <SheetOption label="Ungroup folder" danger icon={icon('albums-outline')} onPress={() => apply(ungroup(rail, folder.id!))} />
          </>
        )}
      </Sheet>
    );
  }

  const guild = guilds[target.id];
  const inFolder = folderOf(rail, target.id);
  const folders = rail.filter((e) => e.id !== null && e.id !== inFolder?.id);
  const lone = loneServers(rail, target.id);
  return (
    <Sheet visible={shown !== null} title={step === 'addToFolder' ? 'Add to folder' : step === 'newFolder' ? 'New folder with' : (guild?.name ?? 'Server')} closeLabel="Close server order menu" onClose={close}>
      {step === 'addToFolder' && folders.map((f) => <SheetOption key={f.id} label={folderLabel(f, (id) => guilds[id]?.name)} onPress={() => apply(addToFolder(rail, target.id, f.id!))} />)}
      {step === 'newFolder' && lone.map((id) => <SheetOption key={id} label={guilds[id]?.name ?? id} onPress={() => apply(createFolder(rail, target.id, id))} />)}
      {step === 'menu' && (
        <>
          <SheetOption label="Move up" icon={icon('chevron-up')} onPress={() => apply(stepGuild(rail, target.id, -1))} />
          <SheetOption label="Move down" icon={icon('chevron-down')} onPress={() => apply(stepGuild(rail, target.id, 1))} />
          {folders.length > 0 && <SheetOption label="Add to folder" icon={icon('folder-outline')} onPress={() => setStep('addToFolder')} />}
          {!inFolder && lone.length > 0 && <SheetOption label="Make a folder with another server" icon={icon('folder-open-outline')} onPress={() => setStep('newFolder')} />}
          {inFolder && <SheetOption label="Remove from folder" icon={icon('exit-outline')} onPress={() => apply(removeFromFolder(rail, target.id))} />}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20, paddingBottom: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: theme.text },
});
