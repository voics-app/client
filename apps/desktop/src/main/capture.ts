/**
 * Screen capture: the renderer shows our own picker (desktopCapturer sources),
 * then calls getDisplayMedia(); this handler answers with the chosen source
 * and, on Windows, system/app audio through WASAPI loopback.
 * DRM-protected surfaces render black by design; Watch Together covers that case.
 */
import { desktopCapturer, session } from 'electron';
import type { CaptureSelection, CaptureSource } from '../shared/ipc';

let pending: CaptureSelection | null = null;

export async function listCaptureSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
}

export function selectCaptureSource(selection: CaptureSelection): void {
  if (typeof selection?.sourceId !== 'string') throw new Error('invalid capture selection');
  pending = { sourceId: selection.sourceId, audio: Boolean(selection.audio) };
}

export function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const selection = pending;
    pending = null;
    if (!selection) {
      callback({});
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find((s) => s.id === selection.sourceId);
    if (!source) {
      callback({});
      return;
    }
    const loopback = selection.audio && process.platform === 'win32';
    callback(loopback ? { video: source, audio: 'loopback' } : { video: source });
  });
}
