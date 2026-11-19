import { render, screen } from '@testing-library/react-native';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { StickerItems } from '../../src/messages/StickerItems';

beforeEach(() => usePrefsStore.setState(DEFAULT_PREFS));

test('shows an accessible image for a static sticker and a label for unsupported Lottie', () => {
  render(<StickerItems items={[{ id: '8', name: 'wave', format_type: 1 }, { id: '1', name: 'Happy', format_type: 3 }]} />);
  expect(screen.getByLabelText('Sticker: wave')).toBeTruthy();
  expect(screen.getByText('Sticker: Happy')).toBeTruthy();
});

test('does not autoplay animated stickers when the preference is disabled', () => {
  usePrefsStore.setState({ animateStickers: false });
  render(<StickerItems items={[{ id: '9', name: 'dance', format_type: 4 }]} />);
  expect(screen.getByText('Sticker: dance')).toBeTruthy();
});
