import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenShare, type ScreenShareDeps } from '@renderer/application/voice/screenShare';
import { detectProtectedContent, isBlackFrame, type FrameSampler } from '@renderer/application/voice/blackFrame';
import { presetConstraints } from '@renderer/domain/screenPresets';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';

class FakeTrack {
  listeners: Record<string, () => void> = {};
  contentHint = '';
  stopped = false;
  applyConstraints = vi.fn(async () => undefined);
  constructor(public kind: string) {}
  stop() {
    this.stopped = true;
  }
  addEventListener(name: string, fn: () => void) {
    this.listeners[name] = fn;
  }
}

class FakeStream {
  constructor(public tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

const blackSampler: FrameSampler = { sample: async () => new Uint8ClampedArray(64 * 4), dispose: () => undefined };
const colourSampler: FrameSampler = { sample: async () => new Uint8ClampedArray(64 * 4).fill(180), dispose: () => undefined };

function setup(over: { sampler?: FrameSampler; platform?: string; withAudio?: boolean } = {}) {
  const video = new FakeTrack('video');
  const tracks = over.withAudio ? [video, new FakeTrack('audio')] : [video];
  const stream = new FakeStream(tracks);
  const host = { attach: vi.fn(async (_t: unknown, _o: unknown, _a: unknown) => undefined), applyParameters: vi.fn(async () => undefined), detach: vi.fn(async () => undefined) };
  const getDisplayMedia = vi.fn(async () => stream as unknown as MediaStream);
  const capture = { listSources: vi.fn(async () => []), select: vi.fn(async () => undefined) };
  const deps: ScreenShareDeps = {
    capture,
    getDisplayMedia,
    platform: over.platform ?? 'win32',
    host,
    createSampler: () => over.sampler ?? colourSampler,
    wait: async () => undefined,
  };
  return { share: new ScreenShare(deps), host, getDisplayMedia, capture, video, stream };
}

beforeEach(() => {
  vi.stubGlobal('MediaStream', FakeStream);
  useVoiceStore.getState().resetCall();
});
afterEach(() => vi.unstubAllGlobals());

describe('black frame detection', () => {
  it('detects black and non-black frames', () => {
    expect(isBlackFrame(new Uint8ClampedArray(400))).toBe(true);
    expect(isBlackFrame(new Uint8ClampedArray(400).fill(100))).toBe(false);
  });
  it('needs at least two frames and all of them black', async () => {
    expect(await detectProtectedContent(blackSampler, { wait: async () => undefined })).toBe(true);
    expect(await detectProtectedContent(colourSampler, { wait: async () => undefined })).toBe(false);
    const none: FrameSampler = { sample: async () => null, dispose: () => undefined };
    expect(await detectProtectedContent(none, { wait: async () => undefined })).toBe(false);
  });
});

describe('ScreenShare', () => {
  it('selects the source, requests preset constraints and attaches the track', async () => {
    const { share, host, getDisplayMedia, capture, video } = setup();
    const outcome = await share.start({ sourceId: 'screen:1:0', audio: false, preset: '1440p60' });
    expect(outcome).toEqual({ status: 'sharing' });
    expect(capture.select).toHaveBeenCalledWith({ sourceId: 'screen:1:0', audio: false });
    expect(capture.select.mock.invocationCallOrder[0]).toBeLessThan(getDisplayMedia.mock.invocationCallOrder[0]!);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { width: { ideal: 2560, max: 2560 }, height: { ideal: 1440, max: 1440 }, frameRate: { ideal: 60, max: 60 } },
      audio: false,
    });
    expect(host.attach).toHaveBeenCalledWith(video, { constraints: presetConstraints('1440p60'), contentHint: 'detail' }, null);
    expect(useVoiceStore.getState().selfStream).toBe(true);
    expect(useVoiceStore.getState().streamPreset).toBe('1440p60');
  });

  it('includes loopback audio on Windows only', async () => {
    const win = setup({ withAudio: true });
    await win.share.start({ sourceId: 's', audio: true, preset: '720p30' });
    expect(win.capture.select).toHaveBeenCalledWith({ sourceId: 's', audio: true });
    expect(win.host.attach.mock.calls[0]![2]).not.toBeNull();

    const mac = setup({ platform: 'darwin' });
    await mac.share.start({ sourceId: 's', audio: true, preset: '720p30' });
    expect(mac.capture.select).toHaveBeenCalledWith({ sourceId: 's', audio: false });
  });

  it('source preset leaves resolution unconstrained', async () => {
    const { share, getDisplayMedia } = setup();
    await share.start({ sourceId: 's', audio: false, preset: 'source' });
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: {}, audio: false });
  });

  it('reports protected content, stops capture and never attaches it', async () => {
    const { share, host, stream } = setup({ sampler: blackSampler });
    const outcome = await share.start({ sourceId: 's', audio: false, preset: '1080p60' });
    expect(outcome).toEqual({ status: 'protected_content' });
    expect(host.attach).not.toHaveBeenCalled();
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
    expect(share.active).toBe(false);
    expect(useVoiceStore.getState().selfStream).toBe(false);
  });

  it('changes the preset live on the track and the sender', async () => {
    const { share, host, video } = setup();
    await share.start({ sourceId: 's', audio: false, preset: '1080p60' });
    await share.setPreset('720p30');
    expect(video.applyConstraints).toHaveBeenCalledWith({ width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } });
    expect(host.applyParameters).toHaveBeenCalledWith(presetConstraints('720p30'));
    expect(useVoiceStore.getState().streamPreset).toBe('720p30');
  });

  it('stops when the captured window closes', async () => {
    const { share, host, video } = setup();
    const ended = vi.fn();
    share.onEnded(ended);
    await share.start({ sourceId: 's', audio: false, preset: '1080p60' });
    video.listeners.ended?.();
    await vi.waitFor(() => expect(ended).toHaveBeenCalled());
    expect(host.detach).toHaveBeenCalled();
    expect(useVoiceStore.getState().selfStream).toBe(false);
    expect(share.active).toBe(false);
  });
});
