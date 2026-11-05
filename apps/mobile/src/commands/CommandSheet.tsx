import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { CommandOptionType as OptionType, type ApplicationCommandOption, type Channel } from '@discordy/core/contracts/rest';
import { isEntityType } from '@discordy/core/domain/entityChoices';
import { validateValues, type OptionValues, type SlashEntry } from '@discordy/core/domain/slashCommand';
import { getRuntime } from '../runtime';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Button, Choices, Field } from '../ui/controls';
import { EntityPickList } from './EntityPickList';

/** The picker an entity option opens inside the sheet, and the labels already picked (the value is an id). */
interface Picking {
  option: ApplicationCommandOption;
}

function OptionControl({ option, value, label, onChange, onPick }: { option: ApplicationCommandOption; value: string; label: string | undefined; onChange(value: string): void; onPick(): void }) {
  if (option.choices && option.choices.length > 0) {
    return <Choices label={option.name} options={option.choices.map((c) => ({ value: String(c.value), label: c.name }))} value={value} onChange={onChange} />;
  }
  if (option.type === OptionType.BOOLEAN) {
    return (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{option.name}</Text>
        <Switch accessibilityLabel={option.name} value={value === 'true'} onValueChange={(on) => onChange(String(on))} trackColor={{ true: theme.accent, false: theme.hairlineStrong }} />
      </View>
    );
  }
  if (isEntityType(option.type)) {
    return (
      <View style={styles.pickWrap}>
        <Text style={styles.pickLabel}>{option.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${option.name}`} onPress={onPick} style={styles.pick}>
          <Text numberOfLines={1} style={[styles.pickText, !label && styles.pickEmpty]}>
            {label ?? 'Choose'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
        </Pressable>
      </View>
    );
  }
  if (option.type === OptionType.ATTACHMENT) return <Text style={styles.unsupported}>{`${option.name}: attachments are not supported in the mobile app yet.`}</Text>;
  const numeric = option.type === OptionType.INTEGER || option.type === OptionType.NUMBER;
  return (
    <Field
      label={option.name}
      value={value}
      placeholder={option.description}
      onChangeText={onChange}
      keyboardType={option.type === OptionType.INTEGER ? 'number-pad' : numeric ? 'decimal-pad' : 'default'}
      {...(option.max_length !== undefined ? { maxLength: option.max_length } : {})}
    />
  );
}

/** Desktop's command panel as a sheet: one control per option (required ones first), then Run. People, roles and channels are picked from a list inside the same sheet. */
export function CommandSheet({ entry: shown, channel, onClose }: { entry: SlashEntry | null; channel: Channel; onClose(): void }) {
  const entry = useLastValue(shown);
  const appName = useInteractionStore((s) => (entry ? s.appNames[entry.command.application_id] : undefined));
  const [values, setValues] = useState<OptionValues>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<Picking | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setValues({});
    setLabels({});
    setPicking(null);
    onClose();
  };
  const errors = entry ? validateValues(entry.options, values) : {};
  const ready = Object.keys(errors).length === 0;
  const ordered = entry ? [...entry.options].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required))) : [];

  const run = async () => {
    if (!entry || busy || !ready) return;
    setBusy(true);
    try {
      await getRuntime().interactions.invoke(channel, entry, values);
      close();
    } catch (error) {
      Alert.alert('Command failed', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={shown !== null} onClose={close} label={entry ? `Command ${entry.label}` : 'Command'} closeLabel="Close command">
      {entry && picking ? (
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setPicking(null)} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
            <Text style={styles.title}>{picking.option.name}</Text>
          </Pressable>
          <EntityPickList
            type={picking.option.type}
            channel={channel}
            channelTypes={picking.option.channel_types}
            onPick={(choice) => {
              setValues((v) => ({ ...v, [picking.option.name]: choice.id }));
              setLabels((l) => ({ ...l, [picking.option.name]: choice.label }));
              setPicking(null);
            }}
          />
        </View>
      ) : (
        entry && (
          <>
            <View style={styles.head}>
              <Text accessibilityRole="header" style={styles.title}>{`/${entry.label}`}</Text>
              {appName ? <Text style={styles.app}>{appName}</Text> : null}
              <Text style={styles.desc}>{entry.description}</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              {ordered.map((o) => {
                const touched = (values[o.name] ?? '') !== '';
                return (
                  <View key={o.name}>
                    <OptionControl option={o} value={values[o.name] ?? ''} label={labels[o.name]} onChange={(v) => setValues((cur) => ({ ...cur, [o.name]: v }))} onPick={() => setPicking({ option: o })} />
                    <Text style={styles.meta}>{o.required ? 'Required' : 'Optional'}</Text>
                    {touched && errors[o.name] ? (
                      <Text accessibilityRole="alert" style={styles.error}>
                        {errors[o.name]}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.actions}>
              <Button label="Run command" tone="primary" busy={busy} disabled={!ready} onPress={() => void run()} />
              <Button label="Cancel" onPress={close} />
            </View>
          </>
        )
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  app: { color: theme.accent, fontSize: 12, fontWeight: '600', marginTop: 2 },
  desc: { color: theme.muted, fontSize: 14, marginTop: 4 },
  form: { paddingHorizontal: 20, paddingTop: 8 },
  actions: { gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  meta: { color: theme.subtle, fontSize: 11, marginTop: -10, marginBottom: 12 },
  error: { color: theme.danger, fontSize: 12, marginTop: -8, marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 14 },
  switchLabel: { color: theme.text, fontSize: 16 },
  pickWrap: { marginBottom: 14 },
  pickLabel: { color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  pick: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 10, paddingHorizontal: 12, backgroundColor: theme.raised },
  pickText: { flex: 1, color: theme.text, fontSize: 16 },
  pickEmpty: { color: theme.subtle },
  unsupported: { color: theme.muted, fontSize: 13, marginBottom: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12 },
});
