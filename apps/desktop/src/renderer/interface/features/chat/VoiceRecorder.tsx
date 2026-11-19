import { Microphone, Stop, Trash, PaperPlaneRight } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { Channel } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { reportError } from '../../app/actions';
import { IconButton } from '../../shared/ui/IconButton';
import { remuxVoiceMessage } from './remuxVoiceMessage';

type Recording = { file: File; duration_secs: number; waveform: string; url: string };
const MAX_MS = 300_000;

/** A recording stays local until the user explicitly sends it. */
export function VoiceRecorder({ channel, disabled }: { channel: Channel; disabled: boolean }) {
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<{ recorder: MediaRecorder; stream: MediaStream; context: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);
  const held = useRef(false);
  const pointerStart = useRef(false);
  const mounted = useRef(true);
  const draftUrl = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    const session = active.current;
    if (session) { clearInterval(session.timer); session.recorder.onstop = null; if (session.recorder.state !== 'inactive') session.recorder.stop(); session.stream.getTracks().forEach((track) => track.stop()); void session.context.close(); }
    if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
  }; }, []);
  const clear = () => { if (draftUrl.current) URL.revokeObjectURL(draftUrl.current); draftUrl.current = null; setDraft(null); };
  const start = async () => {
    if (disabled || busy || active.current) return;
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This device cannot record Opus audio.');
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const bytes = new Uint8Array(analyser.fftSize);
      const samples: number[] = [];
      const chunks: Blob[] = [];
      const started = performance.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { void (async () => {
        const duration = Math.min(MAX_MS, performance.now() - started) / 1000;
        const session = active.current;
        if (session) { clearInterval(session.timer); session.stream.getTracks().forEach((track) => track.stop()); void session.context.close(); active.current = null; }
        if (!mounted.current || !chunks.length) return;
        const waveform = Array.from({ length: 64 }, (_, i) => samples[Math.min(samples.length - 1, Math.floor(i * samples.length / 64))] ?? 0);
        try {
          setBusy(true);
          const raw = new Blob(chunks, { type: mime.split(';')[0] });
          const ogg = mime.startsWith('audio/ogg') ? raw : await remuxVoiceMessage(raw);
          if (!mounted.current) return;
          const file = new File([ogg], 'voice-message.ogg', { type: 'audio/ogg' });
          const url = URL.createObjectURL(file); draftUrl.current = url;
          setDraft({ file, duration_secs: Math.max(0.001, duration), waveform: btoa(String.fromCharCode(...waveform)), url });
        } catch (error) { if (mounted.current) reportError(error, 'Could not prepare voice recording'); }
        finally { if (mounted.current) { setRecording(false); setBusy(false); } }
      })(); };
      recorder.start();
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(bytes);
        samples.push(Math.min(255, Math.round(Math.max(...bytes.map((x) => Math.abs(x - 128))) * 2)));
        if (performance.now() - started >= MAX_MS && recorder.state !== 'inactive') recorder.stop();
      }, 100);
      active.current = { recorder, stream, context, timer };
      setRecording(true);
      if (pointerStart.current && !held.current) recorder.stop();
    } catch (error) { stream?.getTracks().forEach((track) => track.stop()); reportError(error, 'Recording unavailable'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const stop = () => { if (active.current?.recorder.state === 'recording') active.current.recorder.stop(); };
  const send = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try { await getRuntime().privacy.sender.send(channel, { content: '', files: [draft.file], voice: { duration_secs: draft.duration_secs, waveform: draft.waveform } }); clear(); }
    catch (error) { reportError(error, 'Voice message not sent'); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (draft) return <div className="voice-recording-preview"><audio controls src={draft.url} aria-label="Preview voice message" /><IconButton label="Discard recording" disabled={busy} onClick={clear}><Trash size={18} /></IconButton><IconButton label="Send voice message" disabled={busy || disabled} onClick={() => void send()}><PaperPlaneRight size={18} /></IconButton></div>;
  return <IconButton label={recording ? 'Stop recording' : 'Hold to record voice message'} disabled={disabled} onPointerDown={(event) => { if (event.button !== 0 || recording) return; event.currentTarget.setPointerCapture(event.pointerId); held.current = true; pointerStart.current = true; void start(); }} onPointerUp={() => { held.current = false; if (pointerStart.current) stop(); }} onPointerCancel={() => { held.current = false; if (pointerStart.current) stop(); }} onClick={(event) => { if (event.detail !== 0) return; pointerStart.current = false; if (recording) stop(); else void start(); }}>{recording ? <Stop size={20} /> : <Microphone size={20} />}</IconButton>;
}
