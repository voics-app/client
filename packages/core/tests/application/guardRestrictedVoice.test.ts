import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { confirmAgeRestrictedChannel, initialiseAgeRestrictedAccess } from '../../src/application/ageRestrictedAccess';
import { guardRestrictedVoice } from '../../src/application/guardRestrictedVoice';
import { useGuildStore } from '../../src/application/stores/guildStore';
import { useSessionStore } from '../../src/application/stores/sessionStore';
import { useVoiceStore } from '../../src/application/stores/voiceStore';
import { useLightboxStore } from '../../src/application/stores/lightboxStore';

let stop: () => void = () => undefined;
beforeEach(() => {
  useVoiceStore.getState().resetCall();
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  initialiseAgeRestrictedAccess('https://instance.test');
  useSessionStore.getState().setUser({ id: 'me', username: 'Me', avatar: null, global_name: null });
  useSessionStore.getState().setStatus('ready');
  useGuildStore.getState().upsertChannel({ id: 'adult', guild_id: 'g', type: 2, nsfw: true, delivery_mode: 'standard' });
  confirmAgeRestrictedChannel('adult');
});
afterEach(() => stop());

it('ends ongoing voice and closes cached lightbox media when Hide arrives from another device', async () => {
  const leave = vi.fn(async () => useVoiceStore.getState().resetCall());
  stop = guardRestrictedVoice(leave, vi.fn());
  useVoiceStore.getState().setCall({ channelId: 'adult', status: 'connected' });
  useLightboxStore.getState().open([{ kind: 'image', src: 'https://media.test/a.png', original: 'https://media.test/a.png', filename: 'a.png' }]);
  expect(leave).not.toHaveBeenCalled();
  useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } });
  await Promise.resolve();
  expect(leave).toHaveBeenCalledTimes(1);
  expect(useVoiceStore.getState().call.status).toBe('idle');
  expect(useLightboxStore.getState().items).toEqual([]);
});

it('revokes active media after a restricted channel moves under a different parent', async () => {
  const leave = vi.fn(async () => useVoiceStore.getState().resetCall());
  stop = guardRestrictedVoice(leave, vi.fn());
  useVoiceStore.getState().setCall({ channelId: 'adult', status: 'connected' });
  useGuildStore.getState().upsertChannel({ id: 'adult', guild_id: 'g', type: 2, nsfw: true, parent_id: 'unknown', delivery_mode: 'standard' });
  await Promise.resolve();
  expect(leave).toHaveBeenCalledTimes(1);
});
