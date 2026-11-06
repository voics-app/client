import { useEffect, useRef } from 'react';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { dmTitle } from '../../dms/dmModel';
import { GATEWAY_SETTLE_MS, callSnapshot, type CallSnapshot } from './callKitModel';
import { getCallKit } from './index';

/** How often unfinished business (a ring the gateway never confirmed, an answer that never became a call) is looked at again while nothing else changes. */
const RECHECK_MS = 5000;

/**
 * Wires CallKit to the app's life: listens from launch (an answer given on the lock screen of a closed app is waiting), registers the VoIP token when
 * the session is ready, shows DM calls in the system call UI and keeps it in step with the app. Renders nothing; in Expo Go the controller does nothing.
 */
export function CallKitHost() {
  const me = useSessionStore((s) => s.user?.id ?? null);
  const status = useSessionStore((s) => s.status);
  const gateway = useSessionStore((s) => s.gateway);
  const calls = useCallStore((s) => s.calls);
  const channels = useGuildStore((s) => s.channels);
  const relationships = useRelationshipStore((s) => s.byUser);
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const signedIn = status === 'connecting' || status === 'ready';
  const readyAt = useRef<number | null>(null);
  const latest = useRef<CallSnapshot | null>(null);

  useEffect(() => {
    const callKit = getCallKit();
    callKit.attach();
    return () => callKit.detach();
  }, []);

  useEffect(() => {
    if (signedIn) void getCallKit().signedInStart();
    else getCallKit().signedOut();
  }, [signedIn]);

  useEffect(() => {
    readyAt.current = gateway === 'ready' ? Date.now() : null;
  }, [gateway]);

  useEffect(() => {
    const snapshot = callSnapshot({
      me,
      signedIn,
      gatewayReadyAt: gateway === 'ready' ? (readyAt.current ?? Date.now()) : null,
      calls,
      channels,
      call,
      selfMute,
      titleOf: (channel) => dmTitle(channel, relationships),
    });
    latest.current = snapshot;
    getCallKit().update(snapshot);
  }, [me, signedIn, gateway, calls, channels, relationships, call, selfMute]);

  useEffect(() => {
    // Time passing is also a change: a call that vanished is believed once the gateway has settled, and a stuck answer is given up.
    const timer = setInterval(() => latest.current && getCallKit().update(latest.current), RECHECK_MS);
    const settle = gateway === 'ready' ? setTimeout(() => latest.current && getCallKit().update(latest.current), GATEWAY_SETTLE_MS + 100) : null;
    return () => {
      clearInterval(timer);
      if (settle) clearTimeout(settle);
    };
  }, [gateway]);

  return null;
}
