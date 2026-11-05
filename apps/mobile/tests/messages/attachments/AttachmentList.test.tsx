import * as WebBrowser from 'expo-web-browser';
import { fireEvent, render as renderPlain, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useUploadStore } from '@discordy/core/application/stores/uploadStore';
import type { Attachment } from '@discordy/core/contracts/rest';
import { AttachmentList } from '../../../src/messages/attachments/AttachmentList';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const render = (ui: ReactElement) => renderPlain(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const att = (id: string, filename: string, content_type: string, extra: Partial<Attachment> = {}): Attachment => ({ id, filename, content_type, size: 2048, url: `https://cdn.test/${filename}`, ...extra });

describe('AttachmentList', () => {
  beforeEach(() => useUploadStore.setState({ uploads: {} }));

  it('shows images, opens them full screen and closes the viewer', async () => {
    await render(<AttachmentList attachments={[att('1', 'a.png', 'image/png'), att('2', 'b.png', 'image/png')]} messageId="m" sending={false} />);
    await fireEvent.press(screen.getByLabelText('b.png'));
    expect(await screen.findByLabelText('Close viewer')).toBeTruthy();
    expect(screen.getByText(/2 of 2/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close viewer'));
    expect(screen.queryByLabelText('Close viewer')).toBeNull();
  });

  it('collapses images past four into a +N tile', async () => {
    await render(<AttachmentList attachments={Array.from({ length: 6 }, (_, i) => att(String(i), `p${i}.png`, 'image/png'))} messageId="m" sending={false} />);
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.queryByLabelText('p5.png')).toBeNull();
  });

  it('hides a spoiler image until tapped', async () => {
    await render(<AttachmentList attachments={[att('1', 'SPOILER_x.png', 'image/png')]} messageId="m" sending={false} />);
    await fireEvent.press(screen.getByLabelText('Spoiler image, tap to reveal'));
    expect(screen.getByLabelText('x.png')).toBeTruthy();
  });

  it('shows a video as a tile that opens the viewer', async () => {
    await render(<AttachmentList attachments={[att('1', 'clip.mp4', 'video/mp4')]} messageId="m" sending={false} />);
    await fireEvent.press(screen.getByLabelText('clip.mp4'));
    expect(await screen.findByLabelText('Close viewer')).toBeTruthy();
  });

  it('lists files with their size and opens them in the browser', async () => {
    await render(<AttachmentList attachments={[att('1', 'report.pdf', 'application/pdf')]} messageId="m" sending={false} />);
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open report.pdf'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cdn.test/report.pdf');
  });

  it('plays audio from a row', async () => {
    await render(<AttachmentList attachments={[att('1', 'song.mp3', 'audio/mpeg')]} messageId="m" sending={false} />);
    expect(screen.getByText('song.mp3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Play'));
    expect(screen.getByLabelText('Play')).toBeTruthy();
  });

  it('shows upload progress with Cancel while the message is unsent', async () => {
    const abort = jest.fn();
    useUploadStore.setState({ uploads: { m: { loaded: 45, total: 100, abort } } });
    await render(<AttachmentList attachments={[att('local-0', 'a.png', 'image/png')]} messageId="m" sending />);
    expect(screen.getByText('Uploading 45%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel upload'));
    expect(abort).toHaveBeenCalled();
  });
});
