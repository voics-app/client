/**
 * Keeps the ringtone and the desktop notification in step with the calls ringing for the user.
 * The ringtone plays only while there is a ringing call and the user is neither deafened nor has
 * notification sounds turned off; a new ringing call notifies only when the window is unfocused.
 */
import type { Snowflake } from '@shared/contracts/rest';
import { callerOf, isRingingFor, type DmCall } from '@renderer/domain/calls';

export interface RingerSettings {
  notifySounds: boolean;
  notifyDesktop: boolean;
  deafened: boolean;
  outputDeviceId: string | null;
  focused: boolean;
}

export interface RingerDeps {
  ringtone: { start(outputDeviceId: string | null): void; stop(): void };
  settings(): RingerSettings;
  notify(call: DmCall, callerId: Snowflake | null): void;
}

export class CallRinger {
  private ringingChannels = new Set<Snowflake>();

  constructor(private readonly deps: RingerDeps) {}

  update(calls: Record<Snowflake, DmCall>, userId: Snowflake | null): void {
    const incoming = userId ? Object.values(calls).filter((call) => isRingingFor(call, userId)) : [];
    const settings = this.deps.settings();
    const fresh = incoming.filter((call) => !this.ringingChannels.has(call.channelId));
    this.ringingChannels = new Set(incoming.map((call) => call.channelId));

    if (incoming.length === 0 || settings.deafened || !settings.notifySounds) this.deps.ringtone.stop();
    else this.deps.ringtone.start(settings.outputDeviceId);

    if (!userId || settings.focused || !settings.notifyDesktop) return;
    for (const call of fresh) this.deps.notify(call, callerOf(call, userId));
  }

  stop(): void {
    this.ringingChannels = new Set();
    this.deps.ringtone.stop();
  }
}
