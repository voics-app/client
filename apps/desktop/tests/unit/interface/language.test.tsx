// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { LocaleProvider, useI18n } from '@renderer/interface/shared/i18n';
import { LanguageTab } from '@renderer/interface/features/settings/user/LanguageTab';
import { searchSettings } from '@renderer/interface/features/settings/searchIndex';

const { updateSettings } = vi.hoisted(() => ({ updateSettings: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { updateSettings } }) }));

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setUser({ id: 'me', username: 'Ada', global_name: null, avatar: null });
  useSessionStore.getState().setSettings({ locale: 'en-US' });
  updateSettings.mockReset().mockImplementation(async (patch) => ({ default_delivery_mode: 'standard', ...patch }));
});
afterEach(cleanup);

function ChatLabel() {
  const { t } = useI18n();
  return <p>{t('chat.messageCount', { count: 2 })}</p>;
}

describe('account language UI', () => {
  it('saves Dutch and updates existing labels, accessible names and document language immediately', async () => {
    render(<LocaleProvider><LanguageTab /><ChatLabel /><p dir="auto">Original hello مرحبا</p></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox', { name: 'App language' }), { target: { value: 'nl' } });
    expect(useUnsavedStore.getState().requestLeave()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Taal' });
    expect(updateSettings).toHaveBeenCalledWith({ locale: 'nl' });
    expect(screen.getByRole('combobox', { name: 'App-taal' })).toBeTruthy();
    expect(screen.getByText('2 berichten')).toBeTruthy();
    expect(screen.getByText('Original hello مرحبا')).toBeTruthy();
    expect(document.documentElement.lang).toBe('nl');
    expect(document.documentElement.dir).toBe('ltr');
    await waitFor(() => expect(useUnsavedStore.getState().requestLeave()).toBe(true));
    cleanup();
    render(<LocaleProvider><LanguageTab /></LocaleProvider>);
    expect(screen.getByRole('combobox', { name: 'App-taal' }).getAttribute('aria-describedby')).toBeTruthy();
  });

  it('retains the chosen language and confirmed UI on error, then retries', async () => {
    updateSettings.mockRejectedValueOnce(new Error('Offline'));
    render(<LocaleProvider><LanguageTab /></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('nl');
    expect(document.documentElement.lang).toBe('en-US');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Taal opgeslagen.');
    expect(updateSettings).toHaveBeenCalledTimes(2);
  });

  it('reacts to remote account updates and reset discards only an unsaved choice', async () => {
    render(<LocaleProvider><LanguageTab /></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('en-US');
    act(() => useSessionStore.getState().setSettings({ locale: 'nl-BE' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('nl-BE'));
    expect(screen.getByRole('heading', { name: 'Taal' })).toBeTruthy();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('finds the language page in Dutch and English without changing its route ID', () => {
    expect(searchSettings('taal', undefined, 12, 'nl')[0]).toMatchObject({ tab: 'language', label: 'Taal', rowId: null });
    expect(searchSettings('language', undefined, 12, 'nl')[0]).toMatchObject({ tab: 'language', label: 'Taal' });
  });
});
