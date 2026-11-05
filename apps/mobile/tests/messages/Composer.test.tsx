import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { Composer } from '../../src/messages/Composer';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const mount = (onSubmit = jest.fn()) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Composer mode={{ kind: 'compose' }} blockedReason={null} placeholder="Message #general" canAttach onSubmit={onSubmit} onCancelMode={jest.fn()} />
    </SafeAreaProvider>,
  );

describe('Composer attachments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds a library photo as a preview and sends it without any text', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c/p.jpg', fileName: 'p.jpg', fileSize: 100, mimeType: 'image/jpeg', type: 'image', width: 1, height: 1 }] });
    const onSubmit = jest.fn();
    await mount(onSubmit);
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Photo library'));
    expect(await screen.findByLabelText('Preview of p.jpg')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('', { kind: 'compose' }, [{ uri: 'file:///c/p.jpg', name: 'p.jpg', size: 100, mimeType: 'image/jpeg' }]);
    expect(screen.queryByLabelText('Preview of p.jpg')).toBeNull();
  });

  it('adds a document and lets the user remove it again', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c/r.pdf', name: 'r.pdf', size: 2048, mimeType: 'application/pdf', lastModified: 0 }] });
    await mount();
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Files'));
    expect(await screen.findByText('r.pdf')).toBeTruthy();
    expect(screen.getByLabelText('Send')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove r.pdf'));
    expect(screen.queryByText('r.pdf')).toBeNull();
    expect(screen.queryByLabelText('Send')).toBeNull();
  });

  it('takes a photo with the camera after permission', async () => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c/cam.jpg', fileName: 'cam.jpg', fileSize: 50, mimeType: 'image/jpeg', type: 'image', width: 1, height: 1 }] });
    await mount();
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Take photo or video'));
    await waitFor(() => expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled());
    expect(await screen.findByLabelText('Preview of cam.jpg')).toBeTruthy();
  });

  it('adds nothing when the picker is cancelled', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Photo library'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(screen.queryByLabelText('Send')).toBeNull();
  });
});

describe('Composer emoticons', () => {
  beforeEach(() => usePrefsStore.setState(DEFAULT_PREFS));

  it('turns emoticons into emoji on send, unless Convert emoticons is off', async () => {
    const onSubmit = jest.fn();
    await mount(onSubmit);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nice :)');
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(onSubmit.mock.calls[0]![0]).not.toContain(':)');
    usePrefsStore.getState().set('convertEmoticons', false);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'nice :)');
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(onSubmit.mock.calls[1]![0]).toBe('nice :)');
  });
});
