jest.mock('lottie-react-native', () => require('react-native').View);
import { render } from '@testing-library/react-native';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { StickerItems } from '../../src/messages/StickerItems';

beforeEach(() => { usePrefsStore.setState(DEFAULT_PREFS); jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response); });
afterEach(() => jest.restoreAllMocks());

test('shows an accessible image for a static sticker and a label for unsupported Lottie', async () => {
  const view = await render(<StickerItems items={[{ id: '8', name: 'wave', format_type: 1 }, { id: '1', name: 'Happy', format_type: 3 }]} />);
  expect(view.getByLabelText('Sticker: wave')).toBeTruthy();
  expect(view.getByText('Sticker: Happy')).toBeTruthy();
});

test('does not autoplay animated stickers when the preference is disabled', async () => {
  usePrefsStore.setState({ animateStickers: false });
  const view = await render(<StickerItems items={[{ id: '9', name: 'dance', format_type: 4 }]} />);
  expect(view.getByText('Sticker: dance')).toBeTruthy();
});


test('loads a self-contained Lottie sticker and respects the animation preference', async () => {
  const data = { v: '5.7', w: 320, h: 320, fr: 30, ip: 0, op: 60, assets: [], layers: [] };
  jest.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(data) } as Response);
  usePrefsStore.setState({ animateStickers: false });
  const view = await render(<StickerItems items={[{ id: '1', name: 'Happy', format_type: 3 }]} />);
  const animation = await view.findByTestId('sticker-lottie');
  expect(animation.props.autoPlay).toBe(false);
  expect(animation.props.progress).toBe(0);
});
