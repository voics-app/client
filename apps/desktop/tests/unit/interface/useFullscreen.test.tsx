// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useFullscreen } from '@renderer/interface/shared/hooks/useFullscreen';

describe('useFullscreen', () => {
  let element: HTMLDivElement;
  let fullscreenElement: Element | null;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
    fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    element.requestFullscreen = vi.fn(async () => {
      fullscreenElement = element;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    document.exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
  });

  afterEach(() => {
    cleanup();
    element.remove();
    delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
  });

  const setup = () => renderHook(() => {
    const ref = useRef<HTMLDivElement>(element);
    return useFullscreen(ref);
  });

  it('requests fullscreen for its element and reports it active', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(element.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
  });

  it('exits fullscreen when toggled again while it is the fullscreen element', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it('follows exits made by the browser itself (Esc) through fullscreenchange', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    act(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.active).toBe(false);
  });

  it('stays inactive while a different element is fullscreen', () => {
    const { result } = setup();
    const other = document.createElement('div');
    act(() => {
      fullscreenElement = other;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.active).toBe(false);
  });
});
