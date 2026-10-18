// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '@renderer/interface/shared/ui/Tooltip';

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the label in a body-level portal, not inside the trigger container', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <Tooltip label="Focus" side="top" delay={0}>
          <button type="button">go</button>
        </Tooltip>
      </div>,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => vi.runOnlyPendingTimers());
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Focus');
    expect(container.contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });

  it('dismisses when the page scrolls so it never floats detached from its trigger', () => {
    render(
      <Tooltip label="Mute" delay={0}>
        <button type="button">m</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('tooltip')).not.toBeNull();
    fireEvent.scroll(document, {});
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides on mouse leave and never shows if the pointer leaves before the delay', () => {
    render(
      <Tooltip label="Mute" delay={350}>
        <button type="button">m</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    act(() => vi.runAllTimers());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
