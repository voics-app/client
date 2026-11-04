import type { FrameSampler } from '@renderer/application/voice/blackFrame';

/** Samples video frames of a MediaStream through a hidden video element and canvas. */
export function createStreamSampler(stream: MediaStream, size = { width: 64, height: 36 }): FrameSampler {
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = new MediaStream(stream.getVideoTracks());
  void video.play().catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return {
    sample: () => {
      if (!context || video.readyState < 2 || video.videoWidth === 0) return Promise.resolve(null);
      context.drawImage(video, 0, 0, size.width, size.height);
      return Promise.resolve(context.getImageData(0, 0, size.width, size.height).data);
    },
    dispose: () => {
      video.pause();
      video.srcObject = null;
    },
  };
}
