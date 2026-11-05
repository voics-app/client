import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppActive } from '../../src/messages/useAppActive';

describe('useAppActive', () => {
  it('follows the app going to the background and back', async () => {
    let change: (state: AppStateStatus) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      change = listener as typeof change;
      return { remove };
    });
    const { result, unmount } = await renderHook(() => useAppActive());
    expect(result.current).toBe(true);

    await act(async () => change('background'));
    expect(result.current).toBe(false);

    await act(async () => change('active'));
    expect(result.current).toBe(true);

    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
