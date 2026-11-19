/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResizeHandle, useCallSplit } from '@renderer/interface/features/voice/ResizeHandle';

function Fixture() {
  const split = useCallSplit('vertical');
  return <div ref={(element) => { split.containerRef.current = element; }}><ResizeHandle split={split} /></div>;
}

describe('call split', () => {
  it('resizes with keyboard and clamps both panes', () => {
    render(<Fixture />);
    const divider = screen.getByRole('separator', { name: 'Resize call and chat' });
    expect(divider.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    expect(divider.getAttribute('aria-valuenow')).toBe('57');
    fireEvent.keyDown(divider, { key: 'End' });
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    expect(divider.getAttribute('aria-valuenow')).toBe('75');
    fireEvent.keyDown(divider, { key: 'Home' });
    expect(divider.getAttribute('aria-valuenow')).toBe('25');
  });
});

