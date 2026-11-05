import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { rowSlug } from '@discordy/core/domain/rowSlug';
import { theme } from '../theme';
import { Choices } from '../ui/controls';

/** The row a search result pointed at, so the page can mark it. */
const Highlight = createContext<string | null>(null);

/** A settings page: a scrolling column, with the row a search result pointed at marked. */
export function SettingsPage({ highlight = null, children }: { highlight?: string | null; children: ReactNode }) {
  return (
    <Highlight.Provider value={highlight}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Highlight.Provider>
  );
}

/** A titled row with an optional description and a control on the right (or, for wide controls, underneath). */
export function SettingRow({ title, description, children, stacked = false }: { title: string; description?: string | undefined; children?: ReactNode; stacked?: boolean }) {
  const marked = useContext(Highlight) === rowSlug(title);
  return (
    <View testID={`row-${rowSlug(title)}`} style={[styles.row, stacked && styles.stacked, marked && styles.marked]}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function SwitchRow({ title, description, value, onChange, disabled = false }: { title: string; description?: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return (
    <SettingRow title={title} {...(description ? { description } : {})}>
      <Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </SettingRow>
  );
}

/** One row with a set of exclusive chips under the title. */
export function ChoiceRow<T extends string | number>({ title, description, options, value, onChange }: { title: string; description?: string; options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void }) {
  return (
    <SettingRow title={title} {...(description ? { description } : {})} stacked>
      <Choices label={title} options={options} value={value} onChange={onChange} />
    </SettingRow>
  );
}

/** A value changed with minus and plus buttons, 44 pt each, between a minimum and a maximum. */
export function StepperRow({ title, description, value, min, max, step, format, onChange }: { title: string; description?: string; value: number; min: number; max: number; step: number; format(value: number): string; onChange(value: number): void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
  return (
    <SettingRow title={title} {...(description ? { description } : {})}>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${title}`} disabled={value <= min} onPress={() => onChange(clamp(value - step))} style={[styles.step, value <= min && styles.off]}>
          <Text style={styles.stepText}>-</Text>
        </Pressable>
        <Text accessibilityLabel={`${title}: ${format(value)}`} style={styles.value}>
          {format(value)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${title}`} disabled={value >= max} onPress={() => onChange(clamp(value + step))} style={[styles.step, value >= max && styles.off]}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </SettingRow>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.section}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  marked: { backgroundColor: theme.accentSoft },
  copy: { flex: 1 },
  title: { color: theme.text, fontSize: 16 },
  description: { color: theme.subtle, fontSize: 13, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: theme.text, fontSize: 22, fontWeight: '600' },
  off: { opacity: 0.4 },
  value: { color: theme.text, fontSize: 15, minWidth: 56, textAlign: 'center' },
  section: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', marginTop: 20, marginBottom: 4, paddingHorizontal: 16 },
  hint: { color: theme.subtle, fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
});
