import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLanguage } from '@discordy/core/application/language';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setUser({ id: 'me', username: 'Ada', global_name: null, avatar: null });
  useSessionStore.getState().setSettings({ locale: 'en-US' });
});

describe('account language preference', () => {
  it('saves only locale and applies the confirmed account preference', async () => {
    const updateSettings = vi.fn(async () => ({ default_delivery_mode: 'standard' as const, locale: 'nl' }));
    await saveLanguage({ updateSettings }, 'nl');
    expect(updateSettings).toHaveBeenCalledWith({ locale: 'nl' });
    expect(useSessionStore.getState().settings.locale).toBe('nl');
  });

  it('keeps the current language when the request fails, allowing retry', async () => {
    const updateSettings = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ locale: 'nl' });
    await expect(saveLanguage({ updateSettings }, 'nl')).rejects.toThrow('Offline');
    expect(useSessionStore.getState().settings.locale).toBe('en-US');
    await saveLanguage({ updateSettings }, 'nl');
    expect(useSessionStore.getState().settings.locale).toBe('nl');
  });

  it('does not apply a late response to another account', async () => {
    let finish!: (settings: { default_delivery_mode: 'standard'; locale: string }) => void;
    const pending = saveLanguage({ updateSettings: () => new Promise((resolve) => { finish = resolve; }) }, 'nl');
    useSessionStore.getState().reset();
    useSessionStore.getState().setUser({ id: 'another', username: 'Bob', global_name: null, avatar: null });
    finish({ default_delivery_mode: 'standard', locale: 'nl' });
    await pending;
    expect(useSessionStore.getState().settings.locale).toBeUndefined();
  });
});
