import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';

export type ButtonTone = 'primary' | 'plain' | 'danger';

export interface ButtonProps {
  label: string;
  onPress(): void;
  tone?: ButtonTone;
  busy?: boolean;
  disabled?: boolean;
  /** Spoken name when the label alone is ambiguous, such as several rows that each say "Log out". */
  accessibilityLabel?: string;
}

export function Button({ label, onPress, tone = 'plain', busy = false, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[tone], (disabled || busy) && styles.off, pressed && styles.down]}
    >
      {busy ? <ActivityIndicator color={theme.text} /> : <Text style={[styles.buttonText, tone === 'primary' && styles.primaryText, tone === 'danger' && styles.dangerText]}>{label}</Text>}
    </Pressable>
  );
}

/** A labelled row of exclusive chips (a radio group). */
export function Choices<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: o.value === value }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, o.value === value && styles.chipOn]}
          >
            <Text style={[styles.chipText, o.value === value && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** A labelled single-line or multi-line text input. */
export function Field({ label, ...input }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={theme.subtle} autoCapitalize="none" autoCorrect={false} {...input} style={[styles.input, input.multiline && styles.multiline]} />
    </View>
  );
}

/** A text-only action in a row: accent by default, red when destructive. */
export function TextButton({ label, onPress, accessibilityLabel, danger = false }: { label: string; onPress(): void; accessibilityLabel?: string; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={8} onPress={onPress}>
      <Text style={[styles.textButton, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

/** The centred line a screen shows instead of content it cannot show. */
export function Notice({ children }: { children: ReactNode }) {
  return <Text style={styles.notice}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: theme.accent },
  plain: { backgroundColor: theme.raised },
  danger: { backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.danger },
  off: { opacity: 0.5 },
  down: { opacity: 0.8 },
  buttonText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  primaryText: { color: theme.accentText },
  dangerText: { color: theme.danger },
  textButton: { color: theme.accent, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
  field: { marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.raised },
  chipOn: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent },
  chipText: { color: theme.muted, fontSize: 14 },
  chipTextOn: { color: theme.text },
  label: { color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, color: theme.text, backgroundColor: theme.raised, fontSize: 16 },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  section: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  notice: { color: theme.muted, textAlign: 'center', padding: 32, fontSize: 15 },
});
