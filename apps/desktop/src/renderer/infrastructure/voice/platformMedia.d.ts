import '@discordy/core/application/stores/voiceStore';

// The core keeps live media opaque; on desktop it is a browser MediaStream.
declare module '@discordy/core/application/stores/voiceStore' {
  interface PlatformMedia {
    stream: MediaStream;
  }
}
