import { describe, expect, it, vi } from 'vitest';
import { createBitmap, overlayLabel, renderOverlay, withStateDot } from '../../../src/main/attention/badgeBitmap';
import { AttentionPresenter, attentionLevel, trayTooltip, windowTitle, type AttentionPort } from '../../../src/main/attention/presenter';

const opaque = (b: { data: Buffer }) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if ((b.data[i] ?? 0) > 0) n++;
  return n;
};
const fakePort = (): AttentionPort => ({ setOverlay: vi.fn(), setBadgeCount: vi.fn(), setTitle: vi.fn(), setTray: vi.fn() });

describe('window title', () => {
  it('prefixes the mention count', () => expect(windowTitle('Brand', { mentions: 3, unread: 5 })).toBe('(3) Brand'));
  it('caps at 99+', () => expect(windowTitle('Brand', { mentions: 150, unread: 0 })).toBe('(99+) Brand'));
  it('uses a bullet for unread only', () => expect(windowTitle('Brand', { mentions: 0, unread: 2 })).toBe('• Brand'));
  it('is plain when read', () => expect(windowTitle('Brand', { mentions: 0, unread: 0 })).toBe('Brand'));
});

describe('levels and tooltip', () => {
  it('ranks mentions over unread', () => {
    expect(attentionLevel({ mentions: 1, unread: 4 })).toBe('mentions');
    expect(attentionLevel({ mentions: 0, unread: 4 })).toBe('unread');
    expect(attentionLevel({ mentions: 0, unread: 0 })).toBe('none');
  });
  it('shows counts in the tooltip', () => expect(trayTooltip('Brand', { mentions: 1, unread: 2 })).toBe('Brand - 1 mention, 2 unread channels'));
});

describe('bitmaps', () => {
  it('labels counts', () => {
    expect(overlayLabel(0)).toBe('');
    expect(overlayLabel(7)).toBe('7');
    expect(overlayLabel(42)).toBe('42');
    expect(overlayLabel(500)).toBe('!');
  });
  it('renders no overlay when nothing is pending', () => expect(renderOverlay(0, 0)).toBeNull());
  it('draws a larger overlay for mentions than for unread', () => {
    const m = renderOverlay(3, 1)!;
    const u = renderOverlay(0, 1)!;
    expect(m.width).toBe(32);
    expect(opaque(m)).toBeGreaterThan(opaque(u));
    expect(opaque(u)).toBeGreaterThan(0);
  });
  it('draws different digits differently', () => expect(renderOverlay(1, 0)!.data.equals(renderOverlay(2, 0)!.data)).toBe(false));
  it('adds a state dot without mutating the base', () => {
    const base = createBitmap(16, 16);
    const out = withStateDot(base, 'mentions');
    expect(opaque(base)).toBe(0);
    expect(opaque(out)).toBeGreaterThan(0);
  });
});

describe('AttentionPresenter', () => {
  it('uses the overlay on Windows', () => {
    const port = fakePort();
    new AttentionPresenter(port, 'Brand', () => createBitmap(16, 16), 'win32').apply({ mentions: 2, unread: 1 });
    expect(port.setOverlay).toHaveBeenCalledWith(expect.anything(), '2 mentions, 1 unread channel');
    expect(port.setBadgeCount).not.toHaveBeenCalled();
    expect(port.setTitle).toHaveBeenCalledWith('(2) Brand');
  });
  it('clears the overlay at zero and uses badge count elsewhere', () => {
    const win = fakePort();
    new AttentionPresenter(win, 'Brand', () => null, 'win32').apply({ mentions: 0, unread: 0 });
    expect(win.setOverlay).toHaveBeenCalledWith(null, '');
    const mac = fakePort();
    new AttentionPresenter(mac, 'Brand', () => null, 'darwin').apply({ mentions: 4, unread: 0 });
    expect(mac.setBadgeCount).toHaveBeenCalledWith(4);
    expect(mac.setOverlay).not.toHaveBeenCalled();
  });
  it('sanitizes bad input', () => {
    const port = fakePort();
    new AttentionPresenter(port, 'Brand', () => null, 'linux').apply({ mentions: Number.NaN, unread: -3 });
    expect(port.setBadgeCount).toHaveBeenCalledWith(0);
  });
});
