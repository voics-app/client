import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, type Channel, type User, type UserSettings } from '../../src/contracts/rest';
import { confirmAgeRestrictedChannel, getAgeRestrictedAccess, initialiseAgeRestrictedAccess, saveHideAgeRestrictedChannels } from '../../src/application/ageRestrictedAccess';
import { useGuildStore } from '../../src/application/stores/guildStore';
import { useSessionStore } from '../../src/application/stores/sessionStore';
import { useLightboxStore } from '../../src/application/stores/lightboxStore';
import { installSpeech } from '../../src/application/ports/speech';
import { readAloudIfWanted } from '../../src/application/ttsReader';
import { usePrefsStore } from '../../src/application/stores/prefsStore';
import { useUiStore } from '../../src/application/stores/uiStore';
import type { Message } from '../../src/contracts/rest';

const user = (id: string): User => ({ id, username: id, discriminator: '0', global_name: null, avatar: null });
const channel = (id: string, extra: Partial<Channel> = {}): Channel => ({ id, type: ChannelType.GUILD_TEXT, guild_id: 'guild', delivery_mode: 'standard', ...extra });
const put = (...channels: Channel[]) => channels.forEach((c) => useGuildStore.getState().upsertChannel(c));

beforeEach(() => {
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  initialiseAgeRestrictedAccess('https://one.example/api');
  useSessionStore.getState().setUser(user('alice'));
  useSessionStore.getState().setStatus('ready');
  put(channel('adult', { nsfw: true }), channel('other', { nsfw: true }), channel('public'));
});

describe('restricted channel access', () => {
  it('withholds spoken content until confirmation and stops active media when a public channel becomes restricted', () => {
    const speak = vi.fn(() => true);
    const cancel = vi.fn();
    installSpeech({ speak, cancel });
    usePrefsStore.setState({ ttsReadAloud: true });
    useUiStore.getState().navigate({ kind: 'guild', guildId: 'guild', channelId: 'adult' });
    const message = { channel_id: 'adult', author: user('bob'), content: 'Restricted content', tts: true } as Message;
    expect(readAloudIfWanted(message, 'alice')).toBe(false);
    expect(speak).not.toHaveBeenCalled();
    confirmAgeRestrictedChannel('adult');
    expect(readAloudIfWanted(message, 'alice')).toBe(true);
    useLightboxStore.getState().open([{ kind: 'image', src: 'https://media.test/public.png', original: 'https://media.test/public.png', filename: 'image' }]);
    put(channel('public', { nsfw: true }));
    expect(useLightboxStore.getState().items).toEqual([]);
    expect(cancel).toHaveBeenCalled();
    installSpeech({ speak: () => false, cancel: () => undefined });
    usePrefsStore.setState({ ttsReadAloud: false });
  });

  it('keeps public channels open and requires explicit confirmation for each restricted channel', () => {
    expect(getAgeRestrictedAccess('public').kind).toBe('open');
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    expect(confirmAgeRestrictedChannel('adult')).toBe(true);
    expect(getAgeRestrictedAccess('adult').kind).toBe('open');
    expect(getAgeRestrictedAccess('other').kind).toBe('confirm');
  });

  it('inherits parent restriction, refuses unknown ancestry and does not accept a parent confirmation for its thread', () => {
    put(channel('thread', { type: ChannelType.PUBLIC_THREAD, parent_id: 'adult' }));
    confirmAgeRestrictedChannel('adult');
    expect(getAgeRestrictedAccess('thread').kind).toBe('confirm');
    put(channel('missing-parent', { type: ChannelType.PUBLIC_THREAD, parent_id: 'missing' }));
    expect(getAgeRestrictedAccess('missing-parent').kind).toBe('unavailable');
    expect(confirmAgeRestrictedChannel('missing-parent')).toBe(false);
    expect(getAgeRestrictedAccess('unknown').kind).toBe('unavailable');
  });

  it('revokes on context changes, including a false/true round trip, but keeps consent on a rename', () => {
    confirmAgeRestrictedChannel('adult');
    put(channel('adult', { nsfw: true, name: 'renamed' }));
    expect(getAgeRestrictedAccess('adult').kind).toBe('open');
    put(channel('adult', { nsfw: false }));
    put(channel('adult', { nsfw: true }));
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    put(channel('thread', { type: ChannelType.PUBLIC_THREAD, parent_id: 'adult' }));
    confirmAgeRestrictedChannel('thread');
    put(channel('thread', { type: ChannelType.PUBLIC_THREAD, parent_id: 'other' }));
    expect(getAgeRestrictedAccess('thread').kind).toBe('confirm');
  });

  it('does not carry confirmation across accounts, instance changes, logout or hide/show', () => {
    confirmAgeRestrictedChannel('adult');
    useSessionStore.getState().setUser(user('bob'));
    useSessionStore.getState().setUser(user('alice'));
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    confirmAgeRestrictedChannel('adult');
    initialiseAgeRestrictedAccess('https://two.example/api');
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    confirmAgeRestrictedChannel('adult');
    useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } });
    expect(getAgeRestrictedAccess('adult').kind).toBe('hidden');
    expect(confirmAgeRestrictedChannel('adult')).toBe(false);
    useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: false } });
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    confirmAgeRestrictedChannel('adult');
    useSessionStore.getState().reset();
    expect(getAgeRestrictedAccess('adult').kind).toBe('unavailable');
    useSessionStore.getState().setUser(user('alice'));
    useSessionStore.getState().setStatus('ready');
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
  });

  it('fails closed for malformed restriction flags, cycles and cross-guild ancestry', () => {
    put(channel('bad', { nsfw: 'false' as unknown as boolean }));
    put(channel('cycle', { parent_id: 'cycle' }));
    put(channel('foreign', { guild_id: 'other-guild', nsfw: true }));
    put(channel('child', { parent_id: 'foreign' }));
    put(channel('empty-parent', { parent_id: '' }));
    put(channel('future-type', { type: 99 as Channel['type'] }));
    for (const id of ['bad', 'cycle', 'child', 'empty-parent', 'future-type']) expect(getAgeRestrictedAccess(id).kind).toBe('unavailable');
  });
});

describe('account preference save', () => {
  it('preserves other preferences and keeps the confirmed value after failure', async () => {
    useSessionStore.getState().setSettings({ preferences: { accent: 'sky' } });
    const updateSettings = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ preferences: { hide_age_restricted_channels: true } });
    await expect(saveHideAgeRestrictedChannels({ updateSettings }, true)).rejects.toThrow('offline');
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
    await saveHideAgeRestrictedChannels({ updateSettings }, true);
    expect(updateSettings).toHaveBeenLastCalledWith({ preferences: { hide_age_restricted_channels: true } });
    expect(useSessionStore.getState().settings.preferences).toEqual({ accent: 'sky', hide_age_restricted_channels: true });
  });

  it('does not apply a late response after logout and login to the same account', async () => {
    let finish!: (value: UserSettings) => void;
    const saving = saveHideAgeRestrictedChannels({ updateSettings: () => new Promise((resolve) => { finish = resolve; }) }, true);
    useSessionStore.getState().reset();
    useSessionStore.getState().setUser(user('alice'));
    useSessionStore.getState().setStatus('ready');
    finish({ default_delivery_mode: 'standard', preferences: { hide_age_restricted_channels: true } });
    await saving;
    expect(useSessionStore.getState().settings.preferences?.hide_age_restricted_channels).toBeUndefined();
  });

  it('does not pretend an older server saved an unsupported preference', async () => {
    await expect(saveHideAgeRestrictedChannels({ updateSettings: vi.fn().mockResolvedValue({ preferences: {} }) }, true)).rejects.toThrow();
    expect(getAgeRestrictedAccess('adult').kind).toBe('confirm');
  });
});
