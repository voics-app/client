import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Invite, OnboardingResponse } from '@discordy/core/contracts/rest';
import { BRAND } from '../brand';
import { getRuntime } from '../runtime';
import { ServerIcon } from '../shell/ServerIcon';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { inviteCodeOf, invitePreview } from './joinModel';

/** Desktop's Join a server dialog: paste an invite link or code, look at the server, then accept. A server you are already in just opens. */
export function JoinServerSheet({ visible, onClose, initialCode, initialGuildId }: { visible: boolean; onClose(): void; initialCode?: string; initialGuildId?: string }) {
  const [text, setText] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screening, setScreening] = useState<{ guildId: string; rules: string[]; revision: number } | null>(null);
  const [joinedGuildId, setJoinedGuildId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [welcome, setWelcome] = useState<{ guildId: string; description: string; channels: { channel_id: string; description: string }[] } | null>(null);
  const [onboarding, setOnboarding] = useState<{ guildId: string; data: OnboardingResponse; choices: number[] } | null>(null);
  const code = inviteCodeOf(text);

  const close = () => {
    setText('');
    setInvite(null);
    setError(null);
    setScreening(null);
    setJoinedGuildId(null);
    setAgreed(false);
    setWelcome(null);
    setOnboarding(null);
    onClose();
  };
  const open = (guildId: string) => useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: null });
  const finishWelcome = async (guildId: string, firstJoin: boolean, suggestedChannel?: string) => {
    if (firstJoin) {
      try {
        const screen = await getRuntime().api.welcomeScreen(guildId);
        if (screen.enabled) { setScreening(null); setWelcome({ guildId, description: screen.description, channels: screen.channels }); return; }
      } catch { /* A welcome screen must not prevent access to the server. */ }
    }
    close(); setTimeout(() => useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: suggestedChannel ?? null }), 300);
  };
  const finishJoin = async (guildId: string, firstJoin: boolean) => {
    if (firstJoin) {
      try {
        const data = await getRuntime().api.onboarding(guildId);
        if (data.config.enabled && data.config.questions.length) {
          setScreening(null); setOnboarding({ guildId, data, choices: data.config.questions.map(() => -1) }); return;
        }
      } catch { /* Onboarding is optional if it cannot be loaded. */ }
    }
    await finishWelcome(guildId, firstJoin);
  };
  const completeOnboarding = async () => {
    if (!onboarding || onboarding.choices.some((choice) => choice < 0)) return;
    setBusy(true); setError(null);
    try {
      const result = await getRuntime().api.completeOnboarding(onboarding.guildId, onboarding.data.revision, onboarding.choices);
      setOnboarding(null);
      await finishWelcome(onboarding.guildId, true, result.channel_ids[0]);
    } catch (e) {
      setError(errorMessage(e));
      try {
        const data = await getRuntime().api.onboarding(onboarding.guildId);
        setOnboarding({ guildId: onboarding.guildId, data, choices: data.config.questions.map(() => -1) });
      } catch { /* Preserve choices for retry. */ }
    } finally { setBusy(false); }
  };

  const lookup = async (given: string | null = code) => {
    if (!given) return;
    setBusy(true);
    setError(null);
    try {
      const found = await getRuntime().api.invite(given);
      const guildId = found.guild?.id;
      if (guildId && useGuildStore.getState().guilds[guildId]) {
        const rules = await getRuntime().api.memberVerification(guildId);
        if (rules.pending) setScreening({ guildId, rules: rules.rules, revision: rules.revision });
        else { close(); open(guildId); }
        return;
      }
      setInvite(found);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      const joined = joinedGuildId ? null : await getRuntime().api.acceptInvite(invite.code);
      const guildId = joinedGuildId ?? joined?.guild?.id ?? invite.guild?.id;
      if (!guildId) throw new Error('The server was not returned by the invite.');
      setJoinedGuildId(guildId);
      const rules = await getRuntime().api.memberVerification(guildId);
      if (rules.pending) setScreening({ guildId, rules: rules.rules, revision: rules.revision });
      else await finishJoin(guildId, true);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const acceptRules = async () => {
    if (!screening || !agreed) return;
    setBusy(true); setError(null);
    try {
      await getRuntime().api.acceptMemberVerification(screening.guildId, screening.revision);
      const userId = useSessionStore.getState().user?.id;
      const member = userId && useGuildStore.getState().members[screening.guildId]?.[userId];
      if (member) useGuildStore.getState().upsertMember(screening.guildId, { ...member, pending: false });
      await finishJoin(screening.guildId, !!joinedGuildId);
    } catch (e) {
      setError(errorMessage(e)); setAgreed(false);
      try {
        const latest = await getRuntime().api.memberVerification(screening.guildId);
        setScreening({ guildId: screening.guildId, rules: latest.rules, revision: latest.revision });
      } catch { /* Retain the rules for retry. */ }
    } finally { setBusy(false); }
  };

  useEffect(() => {
    // A tapped invite link arrives with its code: show the server at once.
    if (visible && initialCode) {
      setText(initialCode);
      void lookup(initialCode);
    }
    // Only a new link or opening the sheet starts a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCode]);

  useEffect(() => {
    if (!visible || !initialGuildId) return;
    setBusy(true);
    getRuntime().api.memberVerification(initialGuildId).then((rules) => {
      if (rules.pending) setScreening({ guildId: initialGuildId, rules: rules.rules, revision: rules.revision });
      else {
        const userId = useSessionStore.getState().user?.id;
        const member = userId && useGuildStore.getState().members[initialGuildId]?.[userId];
        if (member) useGuildStore.getState().upsertMember(initialGuildId, { ...member, pending: false });
        close(); open(initialGuildId);
      }
    }).catch((e: unknown) => setError(errorMessage(e))).finally(() => setBusy(false));
    // Load the selected server when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialGuildId]);

  const preview = invite ? invitePreview(invite) : null;
  return (
    <Sheet visible={visible} title="Join a server" closeLabel="Close join a server" onClose={close}>
      <View style={styles.body}>
        {initialGuildId && !screening && !welcome && !onboarding ? (
          <Text accessibilityRole={error ? 'alert' : undefined} style={styles.hint}>{error ?? 'Loading server rules…'}</Text>
        ) : welcome ? (
          <>
            <Text style={styles.name}>Welcome</Text><Text style={styles.hint}>{welcome.description}</Text>
            {welcome.channels.map((channel) => <Button key={channel.channel_id} label={channel.description} onPress={() => { const guildId = welcome.guildId; close(); useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: channel.channel_id }); }} />)}
            <Button label="Continue" tone="primary" onPress={() => { const guildId = welcome.guildId; close(); open(guildId); }} />
          </>
        ) : onboarding ? (
          <>
            {onboarding.data.config.questions.map((question, qi) => <View key={qi}>
              <Text style={styles.name}>{question.title}</Text>
              {question.options.map((option, oi) => <Pressable key={oi} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: onboarding.choices[qi] === oi }} onPress={() => setOnboarding({ ...onboarding, choices: onboarding.choices.map((choice, i) => i === qi ? oi : choice) })}>
                <Text style={styles.hint}>{onboarding.choices[qi] === oi ? `${option.label} (selected)` : option.label}</Text>
              </Pressable>)}
            </View>)}
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Button label="Continue" tone="primary" busy={busy} disabled={onboarding.choices.some((choice) => choice < 0)} onPress={() => void completeOnboarding()} />
            <Button label="Skip" onPress={() => { const id = onboarding.guildId; setOnboarding(null); void finishWelcome(id, true); }} />
          </>
        ) : screening ? (
          <>
            <Text style={styles.name}>Server rules</Text>
            {screening.rules.map((rule, index) => <Text key={index} style={styles.hint}>{index + 1}. {rule}</Text>)}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel="I agree to these rules" onPress={() => setAgreed(!agreed)}>
              <Text style={styles.name}>{agreed ? 'Agreed to these rules' : 'I agree to these rules'}</Text>
            </Pressable>
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Button label="Accept rules" tone="primary" busy={busy} disabled={!agreed} onPress={() => void acceptRules()} />
          </>
        ) : preview && invite ? (
          <>
            <View style={styles.card}>
              <View style={styles.icon}>
                <ServerIcon guild={{ id: invite.guild?.id ?? '', name: preview.name, icon: invite.guild?.icon ?? null }} />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>
                  {preview.name}
                </Text>
                <Text style={styles.people}>{preview.people}</Text>
              </View>
            </View>
            <Button label="Accept invite" tone="primary" busy={busy} onPress={() => void accept()} />
            <Button label="Back" onPress={() => setInvite(null)} />
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.hint}>Enter an invite link or code.</Text>
            <Field label="Invite link or code" value={text} onChangeText={setText} placeholder={`${BRAND.landingUrl}/invite/hTKzmak`} returnKeyType="go" onSubmitEditing={() => void lookup()} autoFocus keyboardType="url" />
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button label="Continue" tone="primary" busy={busy} disabled={!code} onPress={() => void lookup()} />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  hint: { color: theme.muted, fontSize: 15, marginBottom: 8 },
  error: { color: theme.danger, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, backgroundColor: theme.raised, marginBottom: 8 },
  icon: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raisedHover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 18, fontWeight: '700' },
  people: { color: theme.muted, fontSize: 14, marginTop: 2 },
});
