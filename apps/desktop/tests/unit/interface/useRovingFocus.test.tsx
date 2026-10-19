// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRovingFocus } from '@renderer/interface/shared/hooks/useRovingFocus';

function List({ items, current }: { items: string[]; current?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  useRovingFocus(ref, { selector: 'button' });
  return (
    <ul ref={ref}>
      {items.map((i) => (
        <li key={i}>
          <button type="button" aria-current={i === current || undefined}>{i}</button>
        </li>
      ))}
    </ul>
  );
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};
const buttons = (c: HTMLElement) => [...c.querySelectorAll('button')];

afterEach(cleanup);

describe('useRovingFocus', () => {
  it('makes a single Tab stop, preferring the current item', () => {
    const { container } = render(<List items={['a', 'b', 'c']} current="b" />);
    expect(buttons(container).map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('defaults the Tab stop to the first item', () => {
    const { container } = render(<List items={['a', 'b']} />);
    expect(buttons(container).map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('moves focus with arrows, Home and End and follows focus with the Tab stop', () => {
    const { container } = render(<List items={['a', 'b', 'c']} />);
    const [a, b, c] = buttons(container) as unknown as [HTMLElement, HTMLElement, HTMLElement];
    a.focus();
    expect(press(a, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(a.getAttribute('tabindex')).toBe('-1');
    press(b, 'End');
    expect(document.activeElement).toBe(c);
    press(c, 'ArrowDown');
    expect(document.activeElement).toBe(c);
    press(c, 'Home');
    expect(document.activeElement).toBe(a);
  });

  it('ignores modified keys and keys from nested controls', () => {
    const { container } = render(<List items={['a', 'b']} />);
    const [a, b] = buttons(container) as unknown as [HTMLElement, HTMLElement];
    a.focus();
    expect(press(a, 'ArrowDown', { altKey: true }).defaultPrevented).toBe(false);
    expect(press(a, 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(a);
    expect(b.getAttribute('tabindex')).toBe('-1');
    const inner = document.createElement('input');
    a.parentElement!.appendChild(inner);
    expect(press(inner, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('picks up items that mount later', async () => {
    const { container, rerender } = render(<List items={['a']} />);
    rerender(<List items={['a', 'b']} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(buttons(container).map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });
});
