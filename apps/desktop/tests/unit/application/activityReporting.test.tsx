// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { emptySettings, withMute } from '@discordy/core/domain/notificationSettings';
import type { Channel } from '@discordy/core/contracts/rest';

const { setActivity } = vi.hoisted(() => ({ setActivity: vi.fn() }));
vi.mock('@renderer/interface/app/bridge', () => ({ bridge: { app: { setActivity } } }));
import { currentActivity } from '@renderer/interface/app/notifications';
import { useActivityReporting } from '@renderer/interface/app/activity';

beforeEach(() => {
  setActivity.mockClear();
  useGuildStore.getState().reset();
  useReadStateStore.getState().reset();
  useNotificationSettingsStore.getState().reset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function unreadChannel(id = 'c', type: Channel['type'] = 0) {
  useGuildStore.getState().upsertChannel({ id, type, guild_id: 'g', delivery_mode: 'standard', last_message_id: '20' });
  useReadStateStore.getState().setPosition(id, '10', 1);
}

describe('OS activity reporting', () => {
  it('includes announcement and thread messages, excluding category and voice containers', () => {
    for (const type of [0, 1, 3, 5, 10, 11, 12] as Channel['type'][]) unreadChannel(`channel-${type}`, type);
    unreadChannel('category', 4);
    unreadChannel('voice', 2);
    expect(currentActivity()).toEqual({ mentions: 7, unread: 7 });
  });

  it('hides existing mention badges for muted channels like the server rail', () => {
    unreadChannel();
    useNotificationSettingsStore.getState().upsert(withMute(emptySettings('g'), null, null, 0));
    expect(currentActivity()).toEqual({ mentions: 0, unread: 0 });
  });

  it('updates the OS immediately when notification settings change', () => {
    unreadChannel();
    renderHook(useActivityReporting);
    expect(setActivity).toHaveBeenLastCalledWith({ mentions: 1, unread: 1 });
    act(() => useNotificationSettingsStore.getState().upsert(withMute(emptySettings('g'), 'c', null, 0)));
    expect(setActivity).toHaveBeenLastCalledWith({ mentions: 0, unread: 0 });
    act(() => useNotificationSettingsStore.getState().upsert(emptySettings('g')));
    expect(setActivity).toHaveBeenLastCalledWith({ mentions: 1, unread: 1 });
  });

  it('restores activity when a timed mute expires without another message', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T08:00:00Z'));
    unreadChannel();
    useReadStateStore.getState().setPosition('c', '10', 0);
    useNotificationSettingsStore.getState().upsert(withMute(emptySettings('g'), 'c', 15, Date.now()));
    const mounted = renderHook(useActivityReporting);
    expect(setActivity).toHaveBeenLastCalledWith({ mentions: 0, unread: 0 });
    act(() => vi.advanceTimersByTime(15_000));
    expect(setActivity).toHaveBeenLastCalledWith({ mentions: 0, unread: 1 });
    mounted.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
