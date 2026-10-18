/**
 * Microphone capture chain:
 *   getUserMedia -> [RNNoise worklet] -> input gain -> analyser -> gate gain -> MediaStreamDestination
 * The destination track is what peers receive. The gate (VAD / push-to-talk /
 * self-mute) silences the chain by ramping the gate gain, so the RTP stream
 * stays alive and mute changes do not renegotiate anything.
 */
import type { MicPort } from '@renderer/application/voice/ports';
import { MicGate, levelFromRms, rmsOf } from '@renderer/application/voice/gateLogic';
import type { PrefsData } from '@renderer/application/stores/prefsStore';
import { Listeners } from '../net/emitter';

export interface MicPipelineDeps {
  prefs(): PrefsData;
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
  createContext(): AudioContext;
  /** URL of the bundled RNNoise worklet module; null disables ML noise suppression. */
  rnnoiseModuleUrl: string | null;
  onPushToTalk?: (listener: (pressed: boolean) => void) => () => void;
  setPushToTalkKey?: (keycode: number | null) => Promise<boolean>;
  now?: () => number;
  pollMs?: number;
}

interface Graph {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  gate: GainNode;
  input: GainNode;
  destination: MediaStreamAudioDestinationNode;
  track: MediaStreamTrack;
  signature: string;
}

const signatureOf = (p: PrefsData): string =>
  JSON.stringify([p.inputDeviceId, p.noiseSuppression, p.echoCancellation, p.autoGain]);

export class MicPipeline implements MicPort {
  private graph: Graph | null = null;
  private readonly gate: MicGate;
  private readonly levelListeners = new Listeners<[number, boolean]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribePtt: (() => void) | null = null;
  private selfMute = false;
  private open = false;
  private buffer = new Float32Array(1024);
  private soundshare: { source: MediaStreamAudioSourceNode } | null = null;

  constructor(private readonly deps: MicPipelineDeps) {
    const p = deps.prefs();
    this.gate = new MicGate({ mode: p.inputMode, vadThreshold: p.vadThreshold, pttReleaseDelayMs: p.pttReleaseDelayMs });
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  onLevel(listener: (level: number, transmitting: boolean) => void): () => void {
    return this.levelListeners.add(listener);
  }

  async start(): Promise<MediaStreamTrack> {
    if (this.graph) return this.graph.track;
    const prefs = this.deps.prefs();
    this.graph = await this.build(prefs);
    this.applyGatePrefs(prefs);
    this.unsubscribePtt ??= this.deps.onPushToTalk?.((pressed) => this.gate.setPushToTalk(pressed, this.now())) ?? null;
    this.timer = setInterval(() => this.tick(), this.deps.pollMs ?? 30);
    return this.graph.track;
  }

  private async build(prefs: PrefsData): Promise<Graph> {
    const stream = await this.deps.mediaDevices.getUserMedia({
      audio: {
        deviceId: prefs.inputDeviceId ? { exact: prefs.inputDeviceId } : undefined,
        echoCancellation: prefs.echoCancellation,
        noiseSuppression: prefs.noiseSuppression,
        autoGainControl: prefs.autoGain,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });
    const context = this.deps.createContext();
    const source = context.createMediaStreamSource(stream);
    let tail: AudioNode = source;
    if (prefs.noiseSuppression && this.deps.rnnoiseModuleUrl) {
      try {
        await context.audioWorklet.addModule(this.deps.rnnoiseModuleUrl);
        const denoise = new AudioWorkletNode(context, 'discordy-rnnoise', { channelCount: 1, channelCountMode: 'explicit' });
        tail.connect(denoise);
        tail = denoise;
      } catch (error) {
        console.warn('RNNoise unavailable, falling back to browser noise suppression', error);
      }
    }
    const input = context.createGain();
    input.gain.value = prefs.inputVolume;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const gate = context.createGain();
    gate.gain.value = 0;
    const destination = context.createMediaStreamDestination();
    tail.connect(input);
    input.connect(analyser);
    input.connect(gate);
    gate.connect(destination);
    const track = destination.stream.getAudioTracks()[0];
    if (!track) throw new Error('microphone pipeline produced no audio track');
    return { stream, context, analyser, gate, input, destination, track, signature: signatureOf(prefs) };
  }

  private applyGatePrefs(prefs: PrefsData): void {
    this.gate.configure({ mode: prefs.inputMode, vadThreshold: prefs.vadThreshold, pttReleaseDelayMs: prefs.pttReleaseDelayMs });
    if (this.graph) this.graph.input.gain.value = prefs.inputVolume;
    if (prefs.inputMode === 'ptt') void this.deps.setPushToTalkKey?.(prefs.pttKeycode);
  }

  private tick(): void {
    const graph = this.graph;
    if (!graph) return;
    if (this.buffer.length !== graph.analyser.fftSize) this.buffer = new Float32Array(graph.analyser.fftSize);
    graph.analyser.getFloatTimeDomainData(this.buffer as Float32Array<ArrayBuffer>);
    const level = levelFromRms(rmsOf(this.buffer));
    const open = this.gate.evaluate(level, this.now());
    if (open !== this.open) {
      this.open = open;
      graph.gate.gain.setTargetAtTime(open ? 1 : 0, graph.context.currentTime, 0.01);
    }
    this.levelListeners.emit(level, open);
  }

  /**
   * Mixes shared-screen (loopback) audio into the outgoing track, bypassing the
   * voice gate so it is heard while the mic is muted. Pass null to remove it.
   */
  setSoundshare(stream: MediaStream | null): void {
    this.soundshare?.source.disconnect();
    this.soundshare = null;
    const graph = this.graph;
    if (!graph || !stream || stream.getAudioTracks().length === 0) return;
    const source = graph.context.createMediaStreamSource(stream);
    source.connect(graph.destination);
    this.soundshare = { source };
  }

  setSelfMute(muted: boolean): void {
    this.selfMute = muted;
    this.gate.setSelfMute(muted);
    if (muted && this.graph && this.open) {
      this.open = false;
      this.graph.gate.gain.setTargetAtTime(0, this.graph.context.currentTime, 0.005);
      this.levelListeners.emit(0, false);
    }
  }

  get muted(): boolean {
    return this.selfMute;
  }

  async reconfigure(): Promise<MediaStreamTrack | null> {
    const prefs = this.deps.prefs();
    this.applyGatePrefs(prefs);
    if (!this.graph || this.graph.signature === signatureOf(prefs)) return null;
    this.soundshare = null;
    this.teardownGraph();
    this.graph = await this.build(prefs);
    this.open = false;
    return this.graph.track;
  }

  private teardownGraph(): void {
    const graph = this.graph;
    this.graph = null;
    if (!graph) return;
    for (const track of graph.stream.getTracks()) track.stop();
    graph.track.stop();
    void graph.context.close();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribePtt?.();
    this.unsubscribePtt = null;
    this.teardownGraph();
    this.open = false;
    this.gate.setPushToTalk(false, this.now());
  }
}
