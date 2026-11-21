/** Push notifications on the phone, with every outside thing (the system, the api, storage, navigation) passed in. */
import type { GatewayState } from '@discordy/core/application/ports/gateway';
import type { PushTokenBody } from '@discordy/core/contracts/rest';
import type { NativePush } from './nativePush';
import { badgeOf, foregroundPresentation, permissionPlan, pushTargetOf, registrationOf, type PushEnvironment, type PushStatus, type PushTarget } from './pushModel';

export interface PushDeps {
  /** Null where push cannot work (Expo Go, not iOS or Android): every method then does nothing. */
  native: NativePush | null;
  api: { registerPushToken(body: PushTokenBody): Promise<void> };
  prefs: { offered(): boolean; previews(): boolean; onlyMentions(): boolean; markOffered(): void };
  setStatus(status: PushStatus): void;
  environment: PushEnvironment;
  gatewayState(): GatewayState;
  /** The chat on screen, or null. */
  viewing(): string | null;
  /** Current content acknowledgement, checked even when the gateway is disconnected. */
  canShowChannel?(channelId: string): boolean;
  open(target: PushTarget): void;
  /** The explanation shown before the system prompt; resolves to true when the person agrees to be asked. */
  offer(): Promise<boolean>;
}

export class PushController {
  private signedIn = false;
  private pendingTap: PushTarget | null = null;
  private offering = false;
  private subscriptions: (() => void)[] = [];

  constructor(private readonly deps: PushDeps) {}

  /** Starts listening, once per run and before sign-in, so a tap that launched the app is not lost. */
  attach(): void {
    const { native } = this.deps;
    if (!native) {
      this.deps.setStatus('unavailable');
      return;
    }
    void native.prepare().catch(() => undefined);
    native.setForegroundPolicy((data) => {
      const target = pushTargetOf(data);
      if (this.deps.canShowChannel && (!target || !this.deps.canShowChannel(target.channelId))) return false;
      return foregroundPresentation({ gateway: this.deps.gatewayState(), viewing: this.deps.viewing(), data }) === 'show';
    });
    this.subscriptions.push(
      native.onTap((data) => this.tapped(data)),
      native.onTokenChange((token) => void (this.signedIn && this.register(token))),
    );
    void native.launchedBy().then((data) => data && this.tapped(data));
    void native.permission().then((state) => this.deps.setStatus(state));
  }

  detach(): void {
    this.subscriptions.forEach((stop) => stop());
    this.subscriptions = [];
  }

  /** The session is ready: open a tap that was waiting, register the token when allowed, offer the prompt when it fits. */
  async signedInStart(inChat: boolean): Promise<void> {
    this.signedIn = true;
    if (this.pendingTap) {
      const target = this.pendingTap;
      this.pendingTap = null;
      this.deps.open(target);
    }
    await this.sync(inChat);
  }

  /** The person opened a chat: the moment to offer the permission, if it was never offered. */
  async enteredChat(): Promise<void> {
    if (this.signedIn) await this.sync(true);
  }

  signedOut(): void {
    if (!this.signedIn) return;
    this.signedIn = false;
    this.pendingTap = null;
    void this.deps.native?.setBadge(0).catch(() => undefined);
  }

  /** The Notifications page: ask, or send the person to the system settings after a refusal. */
  async enable(): Promise<void> {
    const { native } = this.deps;
    if (!native) return;
    const permission = await native.permission();
    if (permission === 'denied') return native.openSystemSettings();
    const answer = permission === 'undetermined' ? await native.request() : permission;
    this.deps.prefs.markOffered();
    this.deps.setStatus(answer);
    if (answer === 'granted') await this.registerCurrent();
  }

  /** A setting that travels with the token (previews, only mentions) changed: tell the api again. */
  async refresh(): Promise<void> {
    if (this.signedIn && (await this.deps.native?.permission()) === 'granted') await this.registerCurrent();
  }

  setBadge(unreadMentions: number): void {
    void this.deps.native?.setBadge(badgeOf(unreadMentions)).catch(() => undefined);
  }

  private tapped(data: unknown): void {
    const target = pushTargetOf(data);
    if (!target) return;
    if (this.signedIn) this.deps.open(target);
    else this.pendingTap = target;
  }

  private async sync(inChat: boolean): Promise<void> {
    const { native } = this.deps;
    if (!native) return;
    const permission = await native.permission();
    this.deps.setStatus(permission);
    const plan = permissionPlan({ permission, offered: this.deps.prefs.offered(), inChat });
    if (plan === 'register') await this.registerCurrent();
    if (plan === 'offer' && !this.offering) await this.offerPrompt(native);
  }

  private async offerPrompt(native: NativePush): Promise<void> {
    this.offering = true;
    try {
      const agreed = await this.deps.offer();
      this.deps.prefs.markOffered();
      if (!agreed) return;
      const answer = await native.request();
      this.deps.setStatus(answer);
      if (answer === 'granted') await this.registerCurrent();
    } finally {
      this.offering = false;
    }
  }

  private async registerCurrent(): Promise<void> {
    const token = await this.deps.native?.deviceToken();
    if (token) await this.register(token);
  }

  private async register(token: string): Promise<void> {
    try {
      await this.deps.api.registerPushToken(registrationOf(token, this.deps.environment, this.deps.prefs.previews(), this.deps.prefs.onlyMentions(), this.deps.native?.platform));
    } catch {
      // Offline or the api is down: the next start registers again.
    }
  }
}
