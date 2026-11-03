import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESIZE_SETTLE_MS, trackResizing } from '@renderer/interface/shared/hooks/useWindowResizing';

function fakeWindow() {
  const listeners = new Set<() => void>();
  return {
    addEventListener: (_t: 'resize', l: () => void) => listeners.add(l),
    removeEventListener: (_t: 'resize', l: () => void) => listeners.delete(l),
    fire: () => listeners.forEach((l) => l()),
    count: () => listeners.size,
  };
}

describe('trackResizing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets the flag on resize and clears it after the settle delay', () => {
    const win = fakeWindow();
    const root = { dataset: {} as Record<string, string | undefined> };
    trackResizing(win, root);
    expect(root.dataset.resizing).toBeUndefined();
    win.fire();
    expect(root.dataset.resizing).toBe('true');
    vi.advanceTimersByTime(RESIZE_SETTLE_MS);
    expect(root.dataset.resizing).toBeUndefined();
  });

  it('keeps the flag while resize events keep arriving', () => {
    const win = fakeWindow();
    const root = { dataset: {} as Record<string, string | undefined> };
    trackResizing(win, root);
    win.fire();
    vi.advanceTimersByTime(RESIZE_SETTLE_MS - 10);
    win.fire();
    vi.advanceTimersByTime(RESIZE_SETTLE_MS - 10);
    expect(root.dataset.resizing).toBe('true');
    vi.advanceTimersByTime(10);
    expect(root.dataset.resizing).toBeUndefined();
  });

  it('removes the listener and the flag on dispose', () => {
    const win = fakeWindow();
    const root = { dataset: {} as Record<string, string | undefined> };
    const dispose = trackResizing(win, root);
    win.fire();
    dispose();
    expect(win.count()).toBe(0);
    expect(root.dataset.resizing).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
