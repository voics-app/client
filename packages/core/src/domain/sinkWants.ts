/** MEDIA_SINK_WANTS (voice op 15) for remote screen shares, which the SFU forwards only to subscribers that opt in. */
import type { MediaSinkWants } from '../contracts/voice';

/** Quality requested for a watched screen share; 0 stops the SFU forwarding it. */
export const WATCH_QUALITY = 100;

/**
 * `screens` maps a stream key (`userId:screen`) to the publisher's screen SSRC. Watched shares ask for full quality and the
 * rest for 0. Camera and audio SSRCs are left out on purpose: an SSRC the map omits keeps the SFU's default quality.
 */
export function screenSinkWants(screens: Readonly<Record<string, number>>, watching: readonly string[]): MediaSinkWants {
  const wants: MediaSinkWants = {};
  for (const [key, ssrc] of Object.entries(screens)) {
    if (ssrc > 0) wants[String(ssrc)] = watching.includes(key) ? WATCH_QUALITY : 0;
  }
  return wants;
}
