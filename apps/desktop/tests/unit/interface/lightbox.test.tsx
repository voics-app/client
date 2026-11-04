// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { Lightbox } from '@renderer/interface/features/chat/Lightbox';

const video = { kind: 'video' as const, src: 'https://cdn.test/clip.mp4', original: 'https://cdn.test/clip.mp4', filename: 'clip.mp4' };
const image = { kind: 'image' as const, src: 'https://cdn.test/a.png', original: 'https://cdn.test/a.png', filename: 'a.png' };

beforeEach(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => undefined;
  useLightboxStore.getState().open([video]);
});
afterEach(() => {
  cleanup();
  useLightboxStore.getState().close();
});

describe('Lightbox carousel', () => {
  const second = { ...image, src: 'https://cdn.test/b.png', original: 'https://cdn.test/b.png', filename: 'b.png' };
  const swipe = (from: number, to: number) => {
    const stage = document.querySelector('.lightbox-stage') as HTMLElement;
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: from, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: to, clientY: 100 });
  };

  it('turns to the next image on a swipe left and back on a swipe right', () => {
    useLightboxStore.getState().open([image, second]);
    render(<Lightbox />);
    swipe(300, 100);
    expect(useLightboxStore.getState().index).toBe(1);
    swipe(100, 300);
    expect(useLightboxStore.getState().index).toBe(0);
  });

  it('does not turn on a tap or a short drag', () => {
    useLightboxStore.getState().open([image, second]);
    render(<Lightbox />);
    swipe(200, 190);
    expect(useLightboxStore.getState().index).toBe(0);
  });
});

describe('Lightbox viewing a video', () => {
  it('has the same chrome as images: close, save and open original', () => {
    render(<Lightbox />);
    for (const name of ['Close', 'Save as', 'Open original']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });
  it('closes with the X button', () => {
    render(<Lightbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useLightboxStore.getState().items).toEqual([]);
  });
  it('closes on Escape', () => {
    render(<Lightbox />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLightboxStore.getState().items).toEqual([]);
  });
  it('closes when clicking outside the video, not on it', () => {
    render(<Lightbox />);
    const stage = document.querySelector('.lightbox-stage') as HTMLElement;
    fireEvent.click(document.querySelector('.media-player-video') as HTMLElement);
    expect(useLightboxStore.getState().items).toHaveLength(1);
    fireEvent.click(stage);
    expect(useLightboxStore.getState().items).toEqual([]);
  });
  it('offers no second, native fullscreen button that would hide the viewer chrome', () => {
    render(<Lightbox />);
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).toBeNull();
  });
  it('closes by the backdrop for images too', () => {
    useLightboxStore.getState().open([image]);
    render(<Lightbox />);
    fireEvent.click(document.querySelector('.lightbox-stage') as HTMLElement);
    expect(useLightboxStore.getState().items).toEqual([]);
  });
});
