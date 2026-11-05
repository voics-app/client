import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { GuildTemplate } from '@discordy/core/contracts/rest';
import { parseTemplateCode, templateSummary } from '@discordy/core/domain/templateModel';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { Sheet } from '../ui/Sheet';

type Step = { kind: 'pick' } | { kind: 'name'; template: GuildTemplate | null };

export const MIN_SERVER_NAME = 2;

/** Desktop's Create your server: start empty or from a template (built in, or a pasted template link), then name it and open it. */
export function CreateServerSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const me = useSessionStore((s) => s.user);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [templates, setTemplates] = useState<GuildTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = parseTemplateCode(link);

  useEffect(() => {
    if (!visible || templates) return;
    getRuntime()
      .api.builtinGuildTemplates()
      .then(setTemplates)
      .catch(() => setTemplatesFailed(true));
  }, [visible, templates]);

  const close = () => {
    setStep({ kind: 'pick' });
    setName('');
    setLink('');
    setError(null);
    onClose();
  };

  const previewLink = async () => {
    if (!linked) return;
    setBusy(true);
    setError(null);
    try {
      setStep({ kind: 'name', template: await getRuntime().api.guildTemplate(linked) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (step.kind !== 'name') return;
    setBusy(true);
    setError(null);
    try {
      const api = getRuntime().api;
      const body = { name: name.trim() };
      const guild = step.template ? await api.createGuildFromTemplate(step.template.code, body) : await api.createGuild(body);
      useGuildStore.getState().upsertGuild(guild);
      close();
      useUiStore.getState().navigate({ kind: 'guild', guildId: guild.id, channelId: null });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={step.kind === 'pick' ? 'Create your server' : step.template ? `Customize your ${step.template.name} server` : 'Customize your server'} closeLabel="Close create server" onClose={close}>
      {step.kind === 'pick' ? (
        <View>
          <Text style={styles.hint}>A server is where you and your friends hang out. Start from scratch or pick a template.</Text>
          <ListRow title="Create My Own" subtitle="Start with an empty server." onPress={() => setStep({ kind: 'name', template: null })} />
          {templates?.map((t) => (
            <ListRow key={t.code} title={t.name} subtitle={t.description ?? templateSummary(t)} onPress={() => setStep({ kind: 'name', template: t })} />
          ))}
          {templatesFailed && <Text style={styles.hint}>Templates could not be loaded. You can still create your own server.</Text>}
          <View style={styles.form}>
            <Field label="Have a template link?" value={link} onChangeText={setLink} placeholder="Paste a template link or code" keyboardType="url" />
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button label="Preview template" disabled={!linked} busy={busy} onPress={() => void previewLink()} />
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.hint}>Give your new server a name. You can always change it later.</Text>
          <Field label="Server name" value={name} onChangeText={setName} maxLength={100} placeholder={`${me?.global_name || me?.username || 'My'}'s server`} autoCapitalize="sentences" autoFocus />
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button label="Create server" tone="primary" busy={busy} disabled={name.trim().length < MIN_SERVER_NAME} onPress={() => void create()} />
          <Button label="Back" onPress={() => setStep({ kind: 'pick' })} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { color: theme.muted, fontSize: 14, paddingHorizontal: 20, paddingBottom: 8 },
  form: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 4 },
  error: { color: theme.danger, fontSize: 14, marginBottom: 8 },
});
