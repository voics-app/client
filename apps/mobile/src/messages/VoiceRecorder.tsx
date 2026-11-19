import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import type { OutgoingFile } from './outgoingFile';

type Draft = { uri: string; size: number; duration_secs: number; waveform: string };
type Recorder = { start(): Promise<void>; stop(): Promise<Draft>; cancel(): Promise<void>; discard(uri: string): Promise<void> };

function nativeRecorder(): Recorder | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
    return requireOptionalNativeModule<Recorder>('VoicsRecorder');
  } catch { return null; }
}

function Preview({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  return <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause preview' : 'Play preview'} onPress={() => status.playing ? player.pause() : player.play()}><Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={theme.accent} /></Pressable>;
}

export function VoiceRecorder({ disabled, onSend }: { disabled: boolean; onSend(file: OutgoingFile, voice: { duration_secs: number; waveform: string }): Promise<boolean> }) {
  const recorder = useRef(nativeRecorder()).current;
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const draftUri = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void recorder?.cancel(); if (draftUri.current) void recorder?.discard(draftUri.current); }, [recorder]);
  if (!recorder) return null;
  const stop = async () => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try { const result = await recorder.stop(); draftUri.current = result.uri; setDraft(result); setRecording(false); }
    catch (error) { setRecording(false); Alert.alert('Recording failed', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const start = async () => {
    setBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission is required.');
      await recorder.start(); setRecording(true); timer.current = setTimeout(() => void stop(), 300_000);
    } catch (error) { Alert.alert('Recording unavailable', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const ok = await onSend({ uri: draft.uri, name: 'voice-message.ogg', size: draft.size, mimeType: 'audio/ogg' }, { duration_secs: draft.duration_secs, waveform: draft.waveform });
      if (ok) { void recorder.discard(draft.uri); draftUri.current = null; setDraft(null); }
      else Alert.alert('Voice message not sent', 'Your recording is still available to retry.');
    } finally { setBusy(false); }
  };
  return <View style={styles.row}>
    {draft ? <><Preview uri={draft.uri} /><Text style={styles.text}>Voice message · {Math.ceil(draft.duration_secs)}s</Text><Pressable accessibilityRole="button" accessibilityLabel="Discard recording" onPress={() => { void recorder.discard(draft.uri); draftUri.current = null; setDraft(null); }} disabled={busy}><Ionicons name="trash-outline" size={22} color={theme.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Send voice message" onPress={() => void send()} disabled={busy || disabled}><Ionicons name="send" size={22} color={theme.accent} /></Pressable></> : <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Stop recording' : 'Record voice message'} onPress={() => recording ? void stop() : void start()} disabled={busy || disabled} style={styles.button}><Ionicons name={recording ? 'stop' : 'mic-outline'} size={22} color={theme.accent} /><Text style={styles.text}>{recording ? 'Stop recording' : 'Record voice message'}</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44 }, button: { flexDirection: 'row', alignItems: 'center', gap: 8 }, text: { color: theme.muted, flexShrink: 1 } });
