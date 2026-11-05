import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { QuickSwitcher } from '../../src/switcher/QuickSwitcher';
import { withSafeArea } from '../support/safeArea';
import { resetStores, seedServer } from '../support/server';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const openSwitcher = async () => {
  await render(withSafeArea(<QuickSwitcher />));
  await act(async () => useUiStore.getState().openPalette(true));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  seedServer(0n);
  useUiStore.getState().openPalette(false);
});

describe('QuickSwitcher', () => {
  it('lists channels, servers and screens when opened, and nothing while closed', async () => {
    await render(withSafeArea(<QuickSwitcher />));
    expect(screen.queryByLabelText('Quick switcher search')).toBeNull();
    await act(async () => useUiStore.getState().openPalette(true));
    expect(await screen.findByLabelText('Quick switcher search')).toBeTruthy();
    expect(screen.getByLabelText('#general, Home Base')).toBeTruthy();
    expect(screen.getByLabelText('lobby, Home Base')).toBeTruthy();
    expect(screen.getByLabelText('Home Base')).toBeTruthy();
    expect(screen.getByLabelText('Friends')).toBeTruthy();
    // Categories and forums are containers, not places to jump to.
    expect(screen.queryByLabelText('Talk')).toBeNull();
    expect(screen.queryByLabelText('ideas, Home Base')).toBeNull();
  });

  it('filters as you type and opens the result, closing the sheet', async () => {
    await openSwitcher();
    await fireEvent.changeText(await screen.findByLabelText('Quick switcher search'), 'gen');
    expect(screen.queryByLabelText('lobby, Home Base')).toBeNull();
    await fireEvent.press(screen.getByLabelText('#general, Home Base'));
    expect(router.push).toHaveBeenCalledWith('/servers/g1/general');
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });

  it('shows the narrowed mode for a prefix, and says when nothing matches', async () => {
    await openSwitcher();
    await fireEvent.changeText(await screen.findByLabelText('Quick switcher search'), '!lob');
    expect(screen.getByLabelText('Searching Voice channels')).toBeTruthy();
    expect(screen.getByLabelText('lobby, Home Base')).toBeTruthy();
    expect(screen.queryByLabelText('#general, Home Base')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Quick switcher search'), 'zzzzzz');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
  });

  it('opens the first result when the keyboard says go, and a screen result pushes its route', async () => {
    await openSwitcher();
    await fireEvent.changeText(await screen.findByLabelText('Quick switcher search'), 'friends');
    await fireEvent(screen.getByLabelText('Quick switcher search'), 'submitEditing');
    expect(router.push).toHaveBeenCalledWith('/friends');
  });

  it('selects a server from its row', async () => {
    await openSwitcher();
    await fireEvent.changeText(await screen.findByLabelText('Quick switcher search'), '*home');
    await fireEvent.press(screen.getByLabelText('Home Base'));
    expect(useUiStore.getState().view).toEqual({ kind: 'guild', guildId: 'g1', channelId: null });
  });
});
