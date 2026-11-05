import { Keyboard, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheet } from '../../src/sheets/BottomSheet';
import { BACKDROP_OPACITY, shouldDismiss } from '../../src/sheets/sheetMotion';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
// The sheet is an accessibility modal, so the backdrop behind it is hidden from screen readers (they close it with the escape gesture).
const HIDDEN = { includeHiddenElements: true };
const sheet = (visible: boolean, onClose = jest.fn()) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <BottomSheet visible={visible} onClose={onClose} label="Test sheet">
      <Text>Sheet content</Text>
    </BottomSheet>
  </SafeAreaProvider>
);

describe('BottomSheet', () => {
  it('shows its content only while visible and removes it after sliding out', async () => {
    const view = await render(sheet(false));
    expect(screen.queryByText('Sheet content')).toBeNull();
    await view.rerender(sheet(true));
    expect(screen.getByText('Sheet content')).toBeTruthy();
    await view.rerender(sheet(false));
    await waitFor(() => expect(screen.queryByText('Sheet content')).toBeNull());
  });

  it('dismisses the keyboard before it opens', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await render(sheet(false));
    expect(dismiss).not.toHaveBeenCalled();
    await view.rerender(sheet(true));
    expect(dismiss).toHaveBeenCalled();
  });

  it('closes when the area outside the sheet is tapped', async () => {
    const onClose = jest.fn();
    await render(sheet(true, onClose));
    await fireEvent.press(screen.getByLabelText('Close Test sheet', HIDDEN));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dimmed backdrop apart from the sliding sheet so the backdrop never moves with it', async () => {
    await render(sheet(true));
    const backdrop = screen.getByTestId('sheet-backdrop', HIDDEN);
    // The content is not inside the backdrop view, so the sheet's translation cannot drag the backdrop along.
    for (let node = screen.getByText('Sheet content').parent; node; node = node.parent) expect(node).not.toBe(backdrop);
  });

  it('has a grab handle', async () => {
    await render(sheet(true));
    expect(screen.getByLabelText('Drag down to close')).toBeTruthy();
  });
});

describe('sheet motion', () => {
  it('dims to about 45 percent black rather than a near opaque layer', () => {
    expect(BACKDROP_OPACITY).toBeGreaterThanOrEqual(0.4);
    expect(BACKDROP_OPACITY).toBeLessThanOrEqual(0.5);
  });

  it('dismisses on a long or fast downward drag only', () => {
    expect(shouldDismiss(120, 0.1)).toBe(true);
    expect(shouldDismiss(20, 1.2)).toBe(true);
    expect(shouldDismiss(30, 0.2)).toBe(false);
  });
});
