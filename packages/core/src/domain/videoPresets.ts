/**
 * Video quality presets shared by camera and screen share. Source keeps the
 * device's native resolution and frame rate (no size constraints).
 */

export type VideoPresetId = '720p30' | '1080p30' | '1080p60' | '1440p60' | '2160p30' | '2160p60' | 'source';

export interface VideoPreset {
  id: VideoPresetId;
  label: string;
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateKbps: number;
}

export const VIDEO_PRESETS: readonly VideoPreset[] = [
  { id: '720p30', label: '720p · 30 fps', width: 1280, height: 720, frameRate: 30, maxBitrateKbps: 2500 },
  { id: '1080p30', label: '1080p · 30 fps', width: 1920, height: 1080, frameRate: 30, maxBitrateKbps: 4500 },
  { id: '1080p60', label: '1080p · 60 fps', width: 1920, height: 1080, frameRate: 60, maxBitrateKbps: 6000 },
  { id: '1440p60', label: '1440p · 60 fps', width: 2560, height: 1440, frameRate: 60, maxBitrateKbps: 9000 },
  { id: '2160p30', label: '4K · 30 fps', width: 3840, height: 2160, frameRate: 30, maxBitrateKbps: 14000 },
  { id: '2160p60', label: '4K · 60 fps', width: 3840, height: 2160, frameRate: 60, maxBitrateKbps: 20000 },
  { id: 'source', label: 'Source', maxBitrateKbps: 20000 },
];

export interface CaptureConstraints {
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateKbps: number;
}

export function presetConstraints(id: VideoPresetId): CaptureConstraints {
  const preset = VIDEO_PRESETS.find((p) => p.id === id) ?? VIDEO_PRESETS[2]!;
  const { width, height, frameRate, maxBitrateKbps } = preset;
  return width === undefined ? { maxBitrateKbps } : { width, height, frameRate, maxBitrateKbps };
}

/**
 * getUserMedia video constraints for a camera preset. Only `ideal` is used so the
 * browser falls back to the nearest mode the device supports instead of failing.
 * Source returns no size constraints (the device's native mode).
 */
export function cameraCaptureConstraints(id: VideoPresetId): MediaTrackConstraints {
  const c = presetConstraints(id);
  if (c.width === undefined) return {};
  return { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: c.frameRate } };
}
