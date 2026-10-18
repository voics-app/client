/**
 * AudioWorklet that runs RNNoise (WASM, inlined by @jitsi/rnnoise-wasm) over the
 * microphone. RNNoise works on 480-sample frames at 48 kHz; the worklet render
 * quantum is 128, so samples are staged through small queues (10 ms latency).
 */
import createModule from '@jitsi/rnnoise-wasm/dist/rnnoise-sync.js';

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const FRAME = 480;
const QUANTUM = 128;
const PCM_SCALE = 32768;

class RnnoiseProcessor extends AudioWorkletProcessor {
  private readonly wasm = createModule();
  private readonly input = this.wasm._malloc(FRAME * 4);
  private readonly context = this.wasm._rnnoise_create(0);
  private readonly inQueue = new Float32Array(FRAME + QUANTUM);
  private inLength = 0;
  private readonly outQueue = new Float32Array(FRAME * 3);
  private outLength = FRAME; // primed with silence so output never underruns

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const source = inputs[0]?.[0];
    const target = outputs[0]?.[0];
    if (!source || !target) return true;

    this.inQueue.set(source, this.inLength);
    this.inLength += source.length;
    while (this.inLength >= FRAME) {
      const base = this.input >> 2;
      for (let i = 0; i < FRAME; i += 1) this.wasm.HEAPF32[base + i] = (this.inQueue[i] ?? 0) * PCM_SCALE;
      this.wasm._rnnoise_process_frame(this.context, this.input, this.input);
      for (let i = 0; i < FRAME; i += 1) this.outQueue[this.outLength + i] = (this.wasm.HEAPF32[base + i] ?? 0) / PCM_SCALE;
      this.outLength += FRAME;
      this.inQueue.copyWithin(0, FRAME, this.inLength);
      this.inLength -= FRAME;
    }

    const n = Math.min(target.length, this.outLength);
    target.set(this.outQueue.subarray(0, n), 0);
    this.outQueue.copyWithin(0, n, this.outLength);
    this.outLength -= n;
    return true;
  }
}

registerProcessor('discordy-rnnoise', RnnoiseProcessor);
