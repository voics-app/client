// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { VideoTile, type Participant } from '@renderer/interface/features/voice/Participants';

vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: {}, gateway: { send: vi.fn() } }) }));

const participant = { state: { user_id: 'me', channel_id: 'c1', guild_id: null, self_mute: false, mute: false, self_deaf: false, deaf: false }, name: 'Me', avatar: null, isSelf: true } as unknown as Participant;
const stream = {} as MediaStream;

function renderTile(kind: 'screen' | 'camera' = 'screen') {
  const view = render(<VideoTile participant={participant} stream={stream} kind={kind} />);
  const tile = view.container.querySelector('.tile') as HTMLElement;
  tile.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  const video = tile.querySelector('video') as HTMLVideoElement;
  return { tile, video };
}

beforeEach(() => useVoiceStore.setState({ watching: [] }));
afterEach(cleanup);

describe('screen share zoom and pan', () => {
  it('zooms with the wheel and shows the level', () => {
    const { tile, video } = renderTile();
    fireEvent.wheel(tile, { deltaY: -100, clientX: 400, clientY: 200 });
    expect(video.style.transform).toContain('scale(');
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('116%');
  });

  it('pans by dragging while zoomed', () => {
    const { tile, video } = renderTile();
    fireEvent.wheel(tile, { deltaY: -500, clientX: 400, clientY: 200 });
    tile.setPointerCapture = vi.fn();
    fireEvent.pointerDown(tile, { pointerId: 1, button: 0, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: 430, clientY: 190 });
    expect(video.style.transform).toMatch(/translate\(30px, -10px\)/);
  });

  it('goes back to 1x on double-click, and double-click toggles fullscreen only at 1x', () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const { tile, video } = renderTile();
    tile.requestFullscreen = requestFullscreen;
    fireEvent.wheel(tile, { deltaY: -100, clientX: 400, clientY: 200 });
    fireEvent.doubleClick(tile);
    expect(video.style.transform).toBe('');
    expect(requestFullscreen).not.toHaveBeenCalled();
    fireEvent.doubleClick(tile);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('resets from the zoom badge', () => {
    const { tile, video } = renderTile();
    fireEvent.wheel(tile, { deltaY: -100, clientX: 400, clientY: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(video.style.transform).toBe('');
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).toBeNull();
  });

  it('leaves cameras alone', () => {
    const { tile, video } = renderTile('camera');
    fireEvent.wheel(tile, { deltaY: -100, clientX: 400, clientY: 200 });
    expect(video.style.transform).toBe('');
  });
});
