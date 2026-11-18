import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { editAttachments } from '@discordy/core/application/attachmentCommands';
import { errorMessage } from '@discordy/core/application/errorMessage';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { attachmentDraft, attachmentMetadataEdits, type AttachmentDraft } from '@discordy/core/domain/attachmentEdits';
import { ALT_TEXT_MAX, displayFilename } from '@discordy/core/domain/media';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { space, theme, type } from '../theme';
import { Button, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

/** Retain the editor during the sheet's closing animation; a different message starts a fresh draft. */
export function AttachmentMetadataSheet({ message, onClose }: { message: ChatMessage | null; onClose(): void }) {
  const retained = useLastValue(message);
  const [opening, setOpening] = useState({ visible: message !== null, version: 0 });
  if (opening.visible !== (message !== null)) {
    setOpening({ visible: message !== null, version: opening.version + (message ? 1 : 0) });
  }
  return retained ? <Editor key={`${retained.id}:${opening.version}`} message={retained} visible={message !== null} onClose={onClose} /> : null;
}

function Editor({ message, visible, onClose }: { message: ChatMessage; visible: boolean; onClose(): void }) {
  const [original] = useState(() => message.attachments);
  const [drafts, setDrafts] = useState(() => original.map(attachmentDraft));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => { if (!busyRef.current) onClose(); }, [onClose]);
  const invalid = drafts.some((draft) => [...draft.description.trim()].length > ALT_TEXT_MAX);
  const edits = invalid ? [] : attachmentMetadataEdits(original, drafts);
  const update = (id: string, patch: Partial<AttachmentDraft>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
    setError(null);
  };
  const save = async () => {
    if (busyRef.current || invalid || edits.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await editAttachments(getRuntime().api, message, edits);
      onClose();
    } catch (failure) {
      setError(`Could not save attachments. ${errorMessage(failure)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} title="Edit attachments" closeLabel="Close attachment editor" onClose={close}>
      <View style={styles.form}>
        <Text style={styles.help}>Update descriptions and spoiler settings for this message.</Text>
        {drafts.map((draft, index) => {
          const name = displayFilename(original[index]!.filename);
          const count = [...draft.description.trim()].length;
          return (
            <View key={draft.id} style={[styles.item, index > 0 && styles.divider]}>
              <Text accessibilityRole="header" style={styles.name}>{name}</Text>
              <Field label="Description" accessibilityLabel={`Description for ${name}`} value={draft.description} multiline editable={!busy}
                placeholder="Describe this attachment" onChangeText={(description) => update(draft.id, { description })} />
              <Text style={styles.count}>{count} / {ALT_TEXT_MAX}</Text>
              {count > ALT_TEXT_MAX && <Text accessibilityRole="alert" style={styles.error}>Use {ALT_TEXT_MAX} characters or fewer.</Text>}
              <View style={styles.spoiler}>
                <View style={styles.spoilerCopy}><Text style={styles.name}>Mark as spoiler</Text><Text style={styles.help}>Hide this file until someone reveals it.</Text></View>
                <Switch accessibilityLabel={`Mark ${name} as spoiler`} value={draft.spoiler} disabled={busy}
                  trackColor={{ true: theme.accent }} onValueChange={(spoiler) => update(draft.id, { spoiler })} />
              </View>
            </View>
          );
        })}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.buttons}>
          <Button label="Save changes" tone="primary" size="large" busy={busy} disabled={invalid || edits.length === 0} onPress={() => void save()} />
          <Button label="Cancel" disabled={busy} onPress={close} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space[5], paddingBottom: space[2], gap: space[4] },
  item: { gap: space[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: space[4] },
  name: { color: theme.text, fontSize: type.body, fontWeight: '600' },
  help: { color: theme.muted, fontSize: type.ui },
  count: { color: theme.muted, fontSize: type.meta, textAlign: 'right' },
  spoiler: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[2] },
  spoilerCopy: { flex: 1, gap: space[1] },
  error: { color: theme.danger, fontSize: type.ui },
  buttons: { gap: space[2], paddingTop: space[2] },
});
