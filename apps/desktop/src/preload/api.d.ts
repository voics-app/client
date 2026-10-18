import type { DiscordyBridge } from '../shared/ipc';

declare global {
  interface Window {
    /** Present inside Electron; absent when the renderer runs in a plain browser (gallery/dev). */
    discordy?: DiscordyBridge;
  }
}

export {};
