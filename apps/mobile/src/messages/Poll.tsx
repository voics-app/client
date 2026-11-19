import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { generateLocalId } from '@discordy/core/application/privacy/types';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';
import { getRuntime } from '../runtime';
import { useAppActive } from './useAppActive';

export function CreatePollSheet({ visible, channelId, onClose }: { visible: boolean; channelId: string; onClose(): void }) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [duration, setDuration] = useState(24);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = question.trim().length > 0 && answers.every((answer) => answer.trim().length > 0);
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const message = await getRuntime().api.sendMessage(channelId, { content: '', nonce: generateLocalId(Date.now()), poll: { question: { text: question.trim() }, answers: answers.map((answer) => ({ poll_media: { text: answer.trim() } })), duration, allow_multiselect: multiple, layout_type: 1 } });
      useMessageStore.getState().receive(message);
      setQuestion(''); setAnswers(['', '']); setDuration(24); setMultiple(false); onClose();
    } catch (error) { Alert.alert('Could not create poll', errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <BottomSheet visible={visible} onClose={onClose} label="Create poll" tall>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
      <Text style={styles.title}>Create poll</Text>
      <Text style={styles.label}>Question</Text><TextInput accessibilityLabel="Question" style={styles.input} maxLength={300} value={question} onChangeText={setQuestion} />
      {answers.map((answer, index) => <View key={index}><Text style={styles.label}>{`Answer ${index + 1}`}</Text><TextInput accessibilityLabel={`Answer ${index + 1}`} style={styles.input} maxLength={55} value={answer} onChangeText={(value) => setAnswers(answers.map((item, i) => i === index ? value : item))} /></View>)}
      {answers.length < 10 && <Pressable accessibilityRole="button" onPress={() => setAnswers([...answers, ''])}><Text style={styles.action}>Add answer</Text></Pressable>}
      {answers.length > 2 && <Pressable accessibilityRole="button" onPress={() => setAnswers(answers.slice(0, -1))}><Text style={styles.action}>Remove last answer</Text></Pressable>}
      <Text style={styles.label}>Duration</Text><View style={styles.options}>{[[1, '1 hour'], [24, '1 day'], [72, '3 days'], [168, '1 week']].map(([hours, label]) => <Pressable key={hours} accessibilityRole="button" accessibilityState={{ selected: duration === hours }} onPress={() => setDuration(Number(hours))} style={[styles.duration, duration === hours && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
      <View style={styles.options}><Text style={styles.text}>Allow multiple answers</Text><Switch accessibilityLabel="Allow multiple answers" value={multiple} onValueChange={setMultiple} /></View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid || busy }} disabled={!valid || busy} onPress={() => void submit()} style={[styles.primary, (!valid || busy) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Creating...' : 'Create poll'}</Text></Pressable>
    </ScrollView>
  </BottomSheet>;
}

export function MessagePoll({ message }: { message: ChatMessage }) {
  const [busy, setBusy] = useState(false);
  const active = useAppActive();
  const gateway = useSessionStore((s) => s.gateway);
  const me = useSessionStore((s) => s.user?.id);
  const poll = message.poll!;
  const results = poll.results;
  const refresh = async () => {
    try { const next = await getRuntime().api.getPoll(message.channel_id, message.id); useMessageStore.getState().patch(message.channel_id, message.id, { poll: next }); }
    catch (error) { Alert.alert('Could not refresh poll', errorMessage(error)); }
  };
  useEffect(() => { if (active) void refresh(); }, [active, gateway, message.channel_id, message.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const vote = async (answer: number, selected: boolean) => {
    if (busy || results?.vote_version === undefined) return;
    setBusy(true);
    try { const next = await getRuntime().api.setPollVote(message.channel_id, message.id, answer, selected, results.vote_version); useMessageStore.getState().patch(message.channel_id, message.id, { poll: next }); }
    catch (error) { Alert.alert('Could not update vote', errorMessage(error)); await refresh(); }
    finally { setBusy(false); }
  };
  const end = async () => {
    setBusy(true);
    try { const next = await getRuntime().api.endPoll(message.channel_id, message.id); useMessageStore.getState().patch(message.channel_id, message.id, next); }
    catch (error) { Alert.alert('Could not end poll', errorMessage(error)); await refresh(); }
    finally { setBusy(false); }
  };
  const closed = results?.is_finalized || Date.now() >= Date.parse(poll.expiry);
  return <View style={styles.poll} accessibilityLabel={`Poll: ${poll.question.text}`}>
    <Text style={styles.title}>{poll.question.text}</Text><Text style={styles.meta}>{closed ? 'Poll ended' : `Ends ${new Date(poll.expiry).toLocaleString()}`}{poll.allow_multiselect ? ' - Select multiple' : ' - Select one'}</Text>
    {poll.answers.map((answer) => { const count = results?.answer_counts.find((entry) => entry.id === answer.answer_id); return <Pressable key={answer.answer_id} accessibilityRole="button" accessibilityState={{ selected: count?.me_voted ?? false, disabled: Boolean(busy || closed || results?.vote_version === undefined) }} disabled={busy || closed || results?.vote_version === undefined} onPress={() => void vote(answer.answer_id, !count?.me_voted)} style={[styles.answer, count?.me_voted && styles.selected]}><Text style={styles.text}>{answer.poll_media.emoji?.name ? `${answer.poll_media.emoji.name} ` : ''}{answer.poll_media.text}</Text><Text style={styles.meta}>{count ? `${count.count} ${count.count === 1 ? 'vote' : 'votes'}` : 'Unknown'}</Text></Pressable>; })}
    {me === message.author.id && !closed && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void end()}><Text style={styles.action}>End poll</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingHorizontal: 20, paddingBottom: 24 }, title: { color: theme.text, fontSize: 17, fontWeight: '600' }, label: { color: theme.muted, fontSize: 13 },
  input: { color: theme.text, backgroundColor: theme.raised, borderRadius: 10, padding: 12, minHeight: 44 }, text: { color: theme.text, fontSize: 14 }, meta: { color: theme.muted, fontSize: 12 },
  options: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, duration: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.hairlineStrong }, selected: { borderColor: theme.accent },
  action: { color: theme.accent, paddingVertical: 10 }, primary: { backgroundColor: theme.accent, borderRadius: 10, padding: 12, alignItems: 'center' }, primaryText: { color: theme.accentText, fontWeight: '600' }, disabled: { opacity: 0.5 },
  poll: { gap: 8, marginTop: 8 }, answer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, minHeight: 44, alignItems: 'center', padding: 10, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairlineStrong, borderRadius: 10 },
});
