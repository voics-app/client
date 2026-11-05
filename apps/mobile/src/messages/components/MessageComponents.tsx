import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ComponentType, CommandOptionType, type Message, type MessageComponent } from '@discordy/core/contracts/rest';
import { buttonTone, safeComponentUrl, selectLimits, toggleSelected, type ButtonTone } from '@discordy/core/domain/slashCommand';
import { BRAND } from '../../brand';
import { EntityPickList } from '../../commands/EntityPickList';
import { getRuntime } from '../../runtime';
import { BottomSheet } from '../../sheets/BottomSheet';
import { theme } from '../../theme';
import { Button } from '../../ui/controls';
import { openLink } from '../markdown/links';

const ENTITY_SELECTS: Record<number, number> = {
  [ComponentType.USER_SELECT]: CommandOptionType.USER,
  [ComponentType.ROLE_SELECT]: CommandOptionType.ROLE,
  [ComponentType.MENTIONABLE_SELECT]: CommandOptionType.MENTIONABLE,
  [ComponentType.CHANNEL_SELECT]: CommandOptionType.CHANNEL,
};

/** Sends a component interaction; the control stays disabled while the request is in flight, and a refusal is shown. */
function usePress(message: Message) {
  const [busy, setBusy] = useState(false);
  const press = async (component: MessageComponent, values?: string[]): Promise<boolean> => {
    setBusy(true);
    try {
      await getRuntime().interactions.pressComponent(message, component, values);
      return true;
    } catch (error) {
      Alert.alert('Interaction failed', errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, press };
}

function EmojiLabel({ component }: { component: MessageComponent }) {
  const emoji = component.emoji;
  if (!emoji) return null;
  return emoji.id ? <Image accessibilityIgnoresInvertColors source={{ uri: `${BRAND.cdnUrl}/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}` }} style={styles.emoji} /> : <Text style={styles.label}>{emoji.name}</Text>;
}

const TONE_STYLE: Record<ButtonTone, object> = {
  primary: { backgroundColor: theme.accent },
  secondary: { backgroundColor: theme.raisedHover },
  success: { backgroundColor: theme.success },
  danger: { backgroundColor: theme.danger },
  link: { backgroundColor: theme.raisedHover },
};

function ButtonView({ message, component }: { message: Message; component: MessageComponent }) {
  const { busy, press } = usePress(message);
  const tone = buttonTone(component.style);
  const href = tone === 'link' ? safeComponentUrl(component.url) : null;
  const disabled = Boolean(component.disabled) || busy || (tone === 'link' && !href);
  return (
    <Pressable
      accessibilityRole={tone === 'link' ? 'link' : 'button'}
      accessibilityLabel={component.label ?? 'Button'}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={() => (tone === 'link' ? href && openLink(href) : void press(component))}
      style={({ pressed }) => [styles.button, TONE_STYLE[tone], disabled && styles.off, pressed && styles.down]}
    >
      <EmojiLabel component={component} />
      {component.label ? <Text style={[styles.label, tone === 'primary' && styles.onAccent]}>{component.label}</Text> : null}
      {tone === 'link' && <Ionicons name="open-outline" size={14} color={theme.text} />}
    </Pressable>
  );
}

function SelectTrigger({ label, disabled, onPress }: { label: string; disabled: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.select, disabled && styles.off]}>
      <Text numberOfLines={1} style={styles.selectText}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={16} color={theme.muted} />
    </Pressable>
  );
}

function StringSelect({ message, component }: { message: Message; component: MessageComponent }) {
  const { busy, press } = usePress(message);
  const options = component.options ?? [];
  const { min, max } = selectLimits(component);
  const multi = max > 1;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => options.filter((o) => o.default).map((o) => o.value));
  const placeholder = component.placeholder ?? 'Select an option';
  const shown = picked.length > 0 ? options.filter((o) => picked.includes(o.value)).map((o) => o.label).join(', ') : placeholder;
  const send = async (values: string[]) => {
    setPicked(values);
    setOpen(false);
    await press(component, values);
  };
  return (
    <>
      <SelectTrigger label={shown} disabled={Boolean(component.disabled) || busy} onPress={() => setOpen(true)} />
      <BottomSheet visible={open} onClose={() => setOpen(false)} label={placeholder}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>
          {placeholder}
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          {options.map((o) => {
            const on = picked.includes(o.value);
            return (
              <Pressable
                key={o.value}
                accessibilityRole={multi ? 'checkbox' : 'button'}
                accessibilityLabel={o.label}
                accessibilityState={multi ? { checked: on } : { selected: on }}
                onPress={() => (multi ? setPicked((cur) => toggleSelected(cur, o.value, max)) : void send([o.value]))}
                style={({ pressed }) => [styles.option, pressed && styles.down]}
              >
                {multi && <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? theme.accent : theme.muted} />}
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                  {o.description ? <Text style={styles.optionDesc}>{o.description}</Text> : null}
                </View>
                {!multi && on && <Ionicons name="checkmark" size={20} color={theme.accent} />}
              </Pressable>
            );
          })}
        </ScrollView>
        {multi && (
          <View style={styles.apply}>
            <Button label="Apply" tone="primary" disabled={picked.length < min} onPress={() => void send(picked)} />
          </View>
        )}
      </BottomSheet>
    </>
  );
}

function EntitySelect({ message, component }: { message: Message; component: MessageComponent }) {
  const { busy, press } = usePress(message);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!channel) return null;
  const placeholder = component.placeholder ?? 'Select';
  return (
    <>
      <SelectTrigger label={chosen ?? placeholder} disabled={Boolean(component.disabled) || busy} onPress={() => setOpen(true)} />
      <BottomSheet visible={open} onClose={() => setOpen(false)} label={placeholder} tall>
        <Text accessibilityRole="header" style={styles.sheetTitle}>
          {placeholder}
        </Text>
        <EntityPickList
          type={ENTITY_SELECTS[component.type]!}
          channel={channel}
          channelTypes={component.channel_types}
          onPick={(choice) => {
            setChosen(choice.label);
            setOpen(false);
            void press(component, [choice.id]);
          }}
        />
      </BottomSheet>
    </>
  );
}

function ComponentView({ message, component }: { message: Message; component: MessageComponent }) {
  if (component.type === ComponentType.BUTTON) return <ButtonView message={message} component={component} />;
  if (component.type === ComponentType.STRING_SELECT) return <StringSelect message={message} component={component} />;
  if (ENTITY_SELECTS[component.type]) return <EntitySelect message={message} component={component} />;
  return null;
}

/** Rows of buttons and select menus an application attached to a message, as on desktop. Menus open as sheets. */
export function MessageComponents({ message }: { message: Message }) {
  const rows = (message.components ?? []).filter((c) => c.type === ComponentType.ACTION_ROW);
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {(row.components ?? []).map((c, j) => (
            <ComponentView key={c.custom_id ?? j} message={message} component={c} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 10 },
  label: { color: theme.text, fontSize: 15, fontWeight: '600' },
  onAccent: { color: theme.accentText },
  emoji: { width: 18, height: 18 },
  off: { opacity: 0.5 },
  down: { opacity: 0.8 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'stretch', flexGrow: 1, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairlineStrong },
  selectText: { flex: 1, color: theme.text, fontSize: 15 },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20, paddingVertical: 8 },
  optionCopy: { flex: 1 },
  optionLabel: { color: theme.text, fontSize: 16 },
  optionDesc: { color: theme.subtle, fontSize: 13 },
  apply: { paddingHorizontal: 20, paddingTop: 8 },
});
