// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useFolderActivity } from '@renderer/interface/features/shell/ServerRail';

afterEach(cleanup);

it('excludes a muted server from unread and mention totals, including folder totals', () => {
  useGuildStore.setState({ channels: {
    a: { id: 'a', guild_id: 'muted', type: 0, delivery_mode: 'standard', last_message_id: '20' },
    b: { id: 'b', guild_id: 'open', type: 0, delivery_mode: 'standard', last_message_id: '20' },
  } });
  useReadStateStore.setState({ byChannel: {
    a: { lastReadId: '10', mentionCount: 7 }, b: { lastReadId: '20', mentionCount: 0 },
  } });
  useNotificationSettingsStore.setState({ byScope: { muted: { guild_id: 'muted', muted: true } } as never });
  const { result } = renderHook(() => useFolderActivity(['muted', 'open']));
  expect(result.current).toEqual({ unread: false, mentions: 0 });
});
