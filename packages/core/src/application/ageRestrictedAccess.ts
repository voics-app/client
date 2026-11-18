import { hidesAgeRestrictedChannels, restrictionContext } from '../domain/ageRestricted';
import type { ApiPort } from './ports/api';
import { clearAgeRestrictedConfirmations, useAgeRestrictedStore } from './stores/ageRestrictedStore';
import { useGuildStore } from './stores/guildStore';
import { useSessionStore } from './stores/sessionStore';
import { useLightboxStore } from './stores/lightboxStore';
import { speech } from './ports/speech';

export type AgeRestrictedAccess = { kind: 'open' | 'confirm' | 'hidden' | 'unavailable' };
let unsubscribe: (() => void) | null = null;

/** Called once by each runtime. Replacing a runtime revokes every acknowledgement. */
export function initialiseAgeRestrictedAccess(instance: string): void {
  unsubscribe?.();
  useAgeRestrictedStore.setState({ instance });
  clearAgeRestrictedConfirmations();
  const stopSession = useSessionStore.subscribe((next, previous) => {
    if (next.user?.id !== previous.user?.id || next.status === 'signedOut' || next.status === 'booting'
      || next.settings.preferences?.hide_age_restricted_channels !== previous.settings.preferences?.hide_age_restricted_channels) {
      clearAgeRestrictedConfirmations();
    }
  });
  const stopChannels = useGuildStore.subscribe((next, previous) => {
    if (next.channels === previous.channels) return;
    const { confirmations } = useAgeRestrictedStore.getState();
    const kept = Object.fromEntries(Object.entries(confirmations).filter(([id, key]) => key === confirmationKey(id)));
    // Media may have opened while the channel was public, without an acknowledgement to prune.
    const contextChanged = Object.entries(previous.channels).some(([id, before]) => {
      const after = next.channels[id];
      return !after || before.nsfw !== after.nsfw || before.parent_id !== after.parent_id
        || before.guild_id !== after.guild_id || before.type !== after.type;
    });
    if (contextChanged) {
      useLightboxStore.getState().close();
      speech.cancel();
    }
    if (Object.keys(kept).length !== Object.keys(confirmations).length) {
      useAgeRestrictedStore.setState({ confirmations: kept });
    }
  });
  unsubscribe = () => { stopSession(); stopChannels(); };
}

function confirmationKey(channelId: string): string | null {
  const context = restrictionContext(channelId, useGuildStore.getState().channels);
  const { instance, generation } = useAgeRestrictedStore.getState();
  const { user } = useSessionStore.getState();
  return context.kind === 'restricted' && instance && user ? JSON.stringify([instance, user.id, generation, context.fingerprint]) : null;
}

export function getAgeRestrictedAccess(channelId: string): AgeRestrictedAccess {
  const context = restrictionContext(channelId, useGuildStore.getState().channels);
  if (context.kind === 'unknown') return { kind: 'unavailable' };
  if (context.kind === 'public') return { kind: 'open' };
  const session = useSessionStore.getState();
  if (!session.user || session.status !== 'ready') return { kind: 'unavailable' };
  if (hidesAgeRestrictedChannels(session.settings.preferences?.hide_age_restricted_channels)) return { kind: 'hidden' };
  const key = confirmationKey(channelId);
  if (!key) return { kind: 'unavailable' };
  return { kind: useAgeRestrictedStore.getState().confirmations[channelId] === key ? 'open' : 'confirm' };
}

export function confirmAgeRestrictedChannel(channelId: string): boolean {
  if (getAgeRestrictedAccess(channelId).kind !== 'confirm') return false;
  const key = confirmationKey(channelId);
  if (!key) return false;
  useAgeRestrictedStore.setState((s) => ({ confirmations: { ...s.confirmations, [channelId]: key } }));
  return true;
}

/** Navigation can show a closed channel so the person can deliberately open its interstitial. */
export function isAgeRestrictedChannelVisible(channelId: string): boolean {
  const context = restrictionContext(channelId, useGuildStore.getState().channels);
  return context.kind !== 'unknown' && (context.kind === 'public' || !hidesAgeRestrictedChannels(useSessionStore.getState().settings.preferences?.hide_age_restricted_channels));
}

export const canShowChannelContent = (channelId: string): boolean => getAgeRestrictedAccess(channelId).kind === 'open';

/** Confirmed account settings only; no device cache migration or optimistic opt-in. */
export async function saveHideAgeRestrictedChannels(api: Pick<ApiPort, 'updateSettings'>, hide: boolean): Promise<void> {
  const { user, status } = useSessionStore.getState();
  const { instance, generation } = useAgeRestrictedStore.getState();
  if (!user || status !== 'ready' || !instance) throw new Error('Sign in before changing this setting.');
  const saved = await api.updateSettings({ preferences: { hide_age_restricted_channels: hide } });
  const current = useSessionStore.getState();
  const access = useAgeRestrictedStore.getState();
  if (current.user?.id !== user.id || access.instance !== instance || access.generation !== generation) return;
  if (saved.preferences?.hide_age_restricted_channels !== hide) throw new Error('This server could not save the age-restricted content setting.');
  current.setSettings({ preferences: { ...current.settings.preferences, hide_age_restricted_channels: hide } });
}
