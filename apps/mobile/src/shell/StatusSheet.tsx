import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { customStatusLine, STATUS_CHOICES } from '@discordy/core/domain/selfPresence';
import { CustomStatusForm } from '../settings/CustomStatusForm';
import { setStatus } from '../settings/presence';
import { theme } from '../theme';
import { Sheet, SheetOption } from '../ui/Sheet';

/** Desktop's user panel menu as a sheet: the four statuses with the chosen one ticked, the custom status editor, Edit profile and the settings. */
export function StatusSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const chosen = useSessionStore((s) => s.settings.status ?? 'online');
  const custom = useSessionStore((s) => s.settings.custom_status);
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  const go = (path: '/settings' | '/settings/profile') => {
    close();
    router.push(path);
  };
  const line = customStatusLine(custom, Date.now());
  return (
    <Sheet visible={visible} title={editing ? 'Your status' : 'Status'} closeLabel="Close status" onClose={close}>
      {editing ? (
        <View style={styles.form}>
          <CustomStatusForm onDone={close} />
        </View>
      ) : (
        <>
          {STATUS_CHOICES.map((s) => (
            <SheetOption
              key={s.id}
              label={s.label}
              icon={<Ionicons name={s.id === chosen ? 'radio-button-on' : 'radio-button-off'} size={20} color={s.id === chosen ? theme.accent : theme.muted} />}
              onPress={() => {
                void setStatus(s.id);
                close();
              }}
            />
          ))}
          <SheetOption label={line ? 'Change custom status' : 'Set custom status'} icon={<Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.muted} />} onPress={() => setEditing(true)} />
          {line ? <Text numberOfLines={1} style={styles.current}>{line}</Text> : null}
          <SheetOption label="Edit profile" icon={<Ionicons name="person-outline" size={20} color={theme.muted} />} onPress={() => go('/settings/profile')} />
          <SheetOption label="Settings" icon={<Ionicons name="settings-outline" size={20} color={theme.muted} />} onPress={() => go('/settings')} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20 },
  current: { color: theme.subtle, fontSize: 13, paddingHorizontal: 52, marginTop: -8, marginBottom: 6 },
});
