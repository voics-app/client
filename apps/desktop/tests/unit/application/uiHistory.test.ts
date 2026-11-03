import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { emptyHistory, pushView } from '@renderer/domain/navHistory';
import { fixedShortcutAction } from '@renderer/domain/shortcutCatalog';

const home = { kind: 'home', channelId: null } as const;
const ch = (id: string) => ({ kind: 'guild', guildId: 'g', channelId: id }) as const;

beforeEach(() => useUiStore.setState({ view: home, history: pushView(emptyHistory(), home), lastChannelByGuild: {} }));

describe('useUiStore navigation history', () => {
  it('records navigations and steps back and forward without recording the steps', () => {
    const ui = useUiStore.getState();
    ui.navigate(ch('a'));
    ui.navigate(ch('b'));
    expect(useUiStore.getState().history.entries).toHaveLength(3);
    expect(useUiStore.getState().back()).toBe(true);
    expect(useUiStore.getState().view).toEqual(ch('a'));
    expect(useUiStore.getState().history.entries).toHaveLength(3);
    expect(useUiStore.getState().forward()).toBe(true);
    expect(useUiStore.getState().view).toEqual(ch('b'));
    expect(useUiStore.getState().forward()).toBe(false);
  });
  it('drops forward entries when navigating from the middle, and stops at the start', () => {
    const ui = useUiStore.getState();
    ui.navigate(ch('a'));
    ui.navigate(ch('b'));
    useUiStore.getState().back();
    useUiStore.getState().navigate(ch('c'));
    expect(useUiStore.getState().forward()).toBe(false);
    useUiStore.getState().back();
    useUiStore.getState().back();
    expect(useUiStore.getState().back()).toBe(false);
    expect(useUiStore.getState().view).toEqual(home);
  });
  it('keeps at most 50 entries and remembers the last channel when stepping', () => {
    for (let i = 0; i < 70; i += 1) useUiStore.getState().navigate(ch(`c${i}`));
    expect(useUiStore.getState().history.entries).toHaveLength(50);
    useUiStore.getState().back();
    expect(useUiStore.getState().lastChannelByGuild.g).toBe('c68');
  });
});

describe('fixed navigation shortcuts', () => {
  it('maps history and cross-server unread keys', () => {
    expect(fixedShortcutAction('Ctrl+[')).toBe('historyBack');
    expect(fixedShortcutAction('Ctrl+]')).toBe('historyForward');
    expect(fixedShortcutAction('Ctrl+Alt+Shift+ArrowUp')).toBe('prevUnreadServer');
    expect(fixedShortcutAction('Ctrl+Alt+Shift+ArrowDown')).toBe('nextUnreadServer');
  });
});
