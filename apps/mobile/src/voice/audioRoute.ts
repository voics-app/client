import type { AudioRouteDriver } from './nativeVoice';

export type Route = 'speaker' | 'earpiece';

/**
 * Where call audio plays. It starts on the loudspeaker (people hold the phone away in a voice channel) and can be
 * switched to the earpiece. The platform session is only active while a call is.
 */
export class AudioRoute {
  private route: Route = 'speaker';
  private active = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly driver: AudioRouteDriver) {}

  get current(): Route {
    return this.route;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Call audio begins: opens the platform audio session on the chosen route. */
  begin(): void {
    if (this.active) return;
    this.active = true;
    this.driver.start();
    this.driver.setSpeaker(this.route === 'speaker');
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    this.driver.stop();
  }

  set(route: Route): void {
    if (route === this.route) return;
    this.route = route;
    if (this.active) this.driver.setSpeaker(route === 'speaker');
    for (const listener of this.listeners) listener();
  }

  toggle(): void {
    this.set(this.route === 'speaker' ? 'earpiece' : 'speaker');
  }
}
