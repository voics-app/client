/** Screen-share quality presets. Source keeps native resolution and frame rate. */

export type ScreenPresetId = '720p30' | '1080p60' | '1440p60' | 'source';

export interface ScreenPreset {
  id: ScreenPresetId;
  label: string;
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateKbps: number;
}

export const SCREEN_PRESETS: readonly ScreenPreset[] = [
  { id: '720p30', label: '720p · 30 fps', width: 1280, height: 720, frameRate: 30, maxBitrateKbps: 2500 },
  { id: '1080p60', label: '1080p · 60 fps', width: 1920, height: 1080, frameRate: 60, maxBitrateKbps: 6000 },
  { id: '1440p60', label: '1440p · 60 fps', width: 2560, height: 1440, frameRate: 60, maxBitrateKbps: 9000 },
  { id: 'source', label: 'Source', maxBitrateKbps: 12000 },
];

export interface CaptureConstraints {
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateKbps: number;
}

export function presetConstraints(id: ScreenPresetId): CaptureConstraints {
  const preset = SCREEN_PRESETS.find((p) => p.id === id) ?? SCREEN_PRESETS[1]!;
  const { width, height, frameRate, maxBitrateKbps } = preset;
  return width === undefined ? { maxBitrateKbps } : { width, height, frameRate, maxBitrateKbps };
}
