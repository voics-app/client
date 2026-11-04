import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface SheetProps {
  visible: boolean;
  title?: string;
  /** Accessibility label of the backdrop, which closes the sheet. */
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
}

/** A bottom sheet over a dimmed backdrop; tapping the backdrop or the Android back button closes it. */
export function Sheet({ visible, title, closeLabel, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={closeLabel} />
      <View style={styles.sheet}>
        {title && (
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export interface SheetOptionProps {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onPress(): void;
}

export function SheetOption({ label, icon, danger, onPress }: SheetOptionProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      {icon}
      <Text style={[styles.optionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

/** The question inside a sheet before something destructive; used instead of an Alert, which iOS may not show while a sheet is closing. */
export function SheetConfirm({ body, confirmLabel, onConfirm, onCancel }: { body: string; confirmLabel: string; onConfirm(): void; onCancel(): void }) {
  return (
    <View>
      <Text style={styles.body}>{body}</Text>
      <SheetOption label={confirmLabel} danger onPress={onConfirm} />
      <SheetOption label="Cancel" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.muted, fontSize: 15, paddingHorizontal: 20, paddingBottom: 8 },
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: { maxHeight: '80%', backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, paddingBottom: 28 },
  title: { color: theme.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  pressed: { backgroundColor: theme.hover },
  optionText: { color: theme.text, fontSize: 16 },
  danger: { color: theme.danger },
});
