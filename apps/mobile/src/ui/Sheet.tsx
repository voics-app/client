import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';

export interface SheetProps {
  visible: boolean;
  title?: string;
  /** Spoken name of the sheet when it has no title; defaults to the close label. */
  label?: string;
  /** Accessibility label of the backdrop, which closes the sheet. */
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
}

/** The app's bottom sheet (fading backdrop, sliding sheet, drag handle) with an optional title and a scrolling body. */
export function Sheet({ visible, title, label, closeLabel, onClose, children }: SheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} label={title ?? label ?? closeLabel} closeLabel={closeLabel}>
      {title && (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      )}
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
        {children}
      </ScrollView>
    </BottomSheet>
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
  title: { color: theme.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  pressed: { backgroundColor: theme.hover },
  optionText: { color: theme.text, fontSize: 16 },
  danger: { color: theme.danger },
});
