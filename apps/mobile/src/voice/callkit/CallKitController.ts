/**
 * Keeps the system call UI (CallKit) and the app's calls in step, and keeps the PushKit token registered, with every outside thing injected.
 *
 * A call reaches CallKit in one of three ways: a VoIP push reported it natively (the `incoming` event), the gateway rings while the app is open
 * (`update` reports it), or the person starts or joins a DM call in the app (`update` shows it as outgoing). From there the system UI can answer, decline,
 * hang up and mute; those arrive as events, and this controller turns them into what the app already does. The other direction, a call that ended in
 * the app or on the far side, ends the system call.
 */
import { ANSWER_JOIN_MS, GATEWAY_SETTLE_MS, RING_SECONDS, type CallSnapshot } from './callKitModel';
import type { CallEndReason, CallKitEvent, NativeCallKit } from './nativeCallKit';

export interface CallKitDeps {
  /** Null where CallKit cannot work (Expo Go, not iOS or Android): every method then does nothing. */
  native: NativeCallKit | null;
  api: {
    registerVoipToken(body: { token: string; environment: 'production' | 'sandbox' }): Promise<void>;
    removeVoipToken(): Promise<void>;
  };
  /** The APNs host this build's tokens belong to. */
  environment: 'production' | 'sandbox';
  now(): number;
  /** Resolves when the session and gateway are ready, so an answer given before the app finished starting can join. */
  whenReady(): Promise<void>;
  /** Answers a ringing DM call: stops the ring here and joins. */
  accept(channelId: string): void;
  /** Declines a ringing DM call. */
  decline(channelId: string): void;
  /** Leaves the call the app is in. */
  hangUp(): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /** CallKit gave the app's audio session to it (or took it back): WebRTC must know. */
  audioSession(active: boolean): void;
  /** Channels CallKit shows, so the app's own ring card can stay out of the way. */
  setShown(channelIds: string[]): void;
}

export class CallKitController {
  /** Calls the system UI shows. */
  private readonly shown = new Set<string>();
  /** Calls answered in the system UI, and when. They end once the app's call is over. */
  private readonly answered = new Map<string, number>();
  /** Calls the person started or joined from the app. */
  private readonly outgoing = new Set<string>();
  /** Calls the app has been in at least once; only those can be over. */
  private readonly seenActive = new Set<string>();
  private readonly connected = new Set<string>();
  private readonly muted = new Map<string, boolean>();
  private token: string | null = null;
  private signedIn = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: CallKitDeps) {}

  /** Starts listening, once per run and before sign-in: an answer given on the lock screen of a closed app is waiting in the native queue. */
  attach(): void {
    const { native } = this.deps;
    if (!native || this.unsubscribe) return;
    this.unsubscribe = native.onEvent((event) => this.handle(event));
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The session is ready: register the VoIP token (it works whether or not notifications are allowed). */
  async signedInStart(): Promise<void> {
    const { native } = this.deps;
    if (!native) return;
    this.signedIn = true;
    this.token ??= await native.voipToken().catch(() => null);
    await this.registerToken();
  }

  /** Signed out: no call may stay in the system UI. The server removes the token with the session. */
  signedOut(): void {
    if (!this.signedIn) return;
    this.signedIn = false;
    for (const channelId of [...this.shown]) void this.deps.native?.endCall(channelId, 'local').catch(() => undefined);
    this.forgetAll();
  }

  /** The app's call state changed (or time passed): show, end and mirror calls in the system UI. */
  update(snapshot: CallSnapshot): void {
    const { native } = this.deps;
    if (!native || !this.signedIn) return;
    this.reportRinging(native, snapshot);
    this.mirrorActive(native, snapshot);
    this.endFinished(native, snapshot);
    this.deps.setShown([...this.shown]);
  }

  private reportRinging(native: NativeCallKit, snapshot: CallSnapshot): void {
    for (const ring of snapshot.ringing) {
      if (this.shown.has(ring.channelId) || snapshot.active?.channelId === ring.channelId) continue;
      this.shown.add(ring.channelId);
      void native
        .reportIncoming({ channelId: ring.channelId, callerName: ring.callerName, isPrivate: ring.isPrivate, ringSeconds: RING_SECONDS })
        .then((reported) => {
          if (reported) return;
          // The system refused it (Do Not Disturb, a call already shown): the app's own card takes over.
          this.shown.delete(ring.channelId);
          this.deps.setShown([...this.shown]);
        })
        .catch(() => {
          this.shown.delete(ring.channelId);
          this.deps.setShown([...this.shown]);
        });
    }
  }

  private mirrorActive(native: NativeCallKit, snapshot: CallSnapshot): void {
    const active = snapshot.active;
    if (!active) return;
    const { channelId } = active;
    this.seenActive.add(channelId);
    if (!this.shown.has(channelId)) {
      this.shown.add(channelId);
      this.outgoing.add(channelId);
      void native.startOutgoing(channelId, active.title || null).then((started) => {
        if (started) return;
        this.shown.delete(channelId);
        this.outgoing.delete(channelId);
        this.deps.setShown([...this.shown]);
      });
    }
    if (active.connected && this.outgoing.has(channelId) && !this.connected.has(channelId)) {
      this.connected.add(channelId);
      void native.reportConnected(channelId).catch(() => undefined);
    }
    if (this.muted.get(channelId) !== snapshot.selfMute && (this.muted.has(channelId) || snapshot.selfMute)) {
      this.muted.set(channelId, snapshot.selfMute);
      void native.setMuted(channelId, snapshot.selfMute).catch(() => undefined);
    }
  }

  private endFinished(native: NativeCallKit, snapshot: CallSnapshot): void {
    const now = this.deps.now();
    const settled = snapshot.gatewayReadyAt !== null && now - snapshot.gatewayReadyAt >= GATEWAY_SETTLE_MS;
    for (const channelId of [...this.shown]) {
      if (snapshot.active?.channelId === channelId) continue;
      const answeredAt = this.answered.get(channelId);
      if (answeredAt !== undefined || this.outgoing.has(channelId)) {
        // The app's call is over (it was in it once), or an answer never turned into a call.
        const over = this.seenActive.has(channelId) || (answeredAt !== undefined && now - answeredAt > ANSWER_JOIN_MS);
        if (over) this.end(native, channelId, this.seenActive.has(channelId) ? 'local' : 'failed');
      } else if (settled && !snapshot.ringing.some((ring) => ring.channelId === channelId)) {
        // It rang and nobody is ringing for this call any more: someone answered, declined or hung up elsewhere, or it timed out.
        this.end(native, channelId, 'unanswered');
      }
    }
  }

  private end(native: NativeCallKit, channelId: string, reason: CallEndReason): void {
    this.forget(channelId);
    void native.endCall(channelId, reason).catch(() => undefined);
  }

  private forget(channelId: string): void {
    this.shown.delete(channelId);
    this.answered.delete(channelId);
    this.outgoing.delete(channelId);
    this.seenActive.delete(channelId);
    this.connected.delete(channelId);
    this.muted.delete(channelId);
  }

  private forgetAll(): void {
    for (const channelId of [...this.shown]) this.forget(channelId);
    this.deps.setShown([]);
  }

  private handle(event: CallKitEvent): void {
    switch (event.type) {
      case 'token':
        this.token = event.token;
        if (this.signedIn) void (event.token ? this.registerToken() : this.removeToken());
        return;
      case 'incoming':
        // A VoIP push reported this call before the app (or its gateway) was up.
        this.shown.add(event.channelId);
        this.deps.setShown([...this.shown]);
        return;
      case 'answer':
        this.shown.add(event.channelId);
        this.answered.set(event.channelId, this.deps.now());
        this.deps.setShown([...this.shown]);
        void this.deps.whenReady().then(() => this.deps.accept(event.channelId));
        return;
      case 'end':
        this.ended(event.channelId, event.reason);
        return;
      case 'mute':
        if (this.deps.isMuted() !== event.muted) this.deps.setMuted(event.muted);
        this.muted.set(event.channelId, event.muted);
        return;
      case 'audio':
        this.deps.audioSession(event.active);
        return;
    }
  }

  private ended(channelId: string, reason: 'timeout' | 'reset' | 'hangup' | 'decline'): void {
    const wasAnswered = this.answered.has(channelId) || this.outgoing.has(channelId);
    this.forget(channelId);
    this.deps.setShown([...this.shown]);
    if (reason === 'decline') void this.deps.whenReady().then(() => this.deps.decline(channelId));
    else if ((reason === 'hangup' || reason === 'reset') && wasAnswered) this.deps.hangUp();
  }

  private async registerToken(): Promise<void> {
    if (!this.token) return;
    try {
      await this.deps.api.registerVoipToken({ token: this.token, environment: this.deps.environment });
    } catch {
      // Offline or the api is down: the next start registers again.
    }
  }

  /** The system took the token back (the install is being reset): do not leave a dead token on the server. */
  private async removeToken(): Promise<void> {
    try {
      await this.deps.api.removeVoipToken();
    } catch {
      // The server drops a token APNs rejects anyway.
    }
  }
}
