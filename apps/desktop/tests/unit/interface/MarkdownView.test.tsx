// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrustedDomainStore } from '@renderer/application/stores/composerStores';
import { MarkdownView } from '@renderer/interface/features/chat/MarkdownView';

const open = vi.fn();
beforeEach(() => {
  open.mockClear();
  vi.stubGlobal('open', open);
  useTrustedDomainStore.setState({ domains: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MarkdownView', () => {
  it('renders headers, subtext, lists and quotes as elements', () => {
    const { container } = render(<MarkdownView source={'# Big\n-# tiny\n- a\n  - b\n1. one\n> q'} />);
    expect(container.querySelector('h1')?.textContent).toBe('Big');
    expect(container.querySelector('small.md-subtext')?.textContent).toBe('tiny');
    expect(container.querySelectorAll('ul li').length).toBe(2);
    expect(container.querySelector('ol li')?.textContent).toBe('one');
    expect(container.querySelector('blockquote')?.textContent).toBe('q');
  });

  it('never injects raw HTML', () => {
    const { container } = render(<MarkdownView source={'<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1))'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders timestamps in local time with a tooltip source and ticking relative style', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const unix = Math.floor(Date.now() / 1000) + 150;
    const { container } = render(<MarkdownView source={`<t:${unix}:R> <t:${unix}:t>`} />);
    const times = container.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0]!.textContent).toBe('in 2 minutes');
    act(() => void vi.advanceTimersByTime(30_000));
    act(() => void vi.advanceTimersByTime(35_000));
    expect(container.querySelectorAll('time')[0]!.textContent).toBe('in 1 minute');
    vi.useRealTimers();
  });

  it('asks before opening masked links to untrusted domains', () => {
    render(<MarkdownView source="[docs](https://example.com/page)" />);
    const link = screen.getByText('docs');
    expect(link.getAttribute('title')).toBe('https://example.com/page');
    fireEvent.click(link);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('https://example.com/page')).toBeTruthy();
    fireEvent.click(screen.getByText('Visit site'));
    expect(open).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');
  });

  it('cancel does not open, and remembered domains skip the prompt', () => {
    render(<MarkdownView source="[docs](https://example.com/page)" />);
    fireEvent.click(screen.getByText('docs'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('docs'));
    fireEvent.click(screen.getByLabelText(/Trust links from example.com/));
    fireEvent.click(screen.getByText('Visit site'));
    expect(useTrustedDomainStore.getState().domains).toContain('example.com');
    open.mockClear();
    fireEvent.click(screen.getByText('docs'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('opens trusted domains directly', () => {
    render(<MarkdownView source="[home](https://discordy.voics.nl/x)" />);
    fireEvent.click(screen.getByText('home'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('highlights fenced code lazily and keeps the text', async () => {
    const { container } = render(<MarkdownView source={'```js\nconst a = "x";\n```'} />);
    expect(container.querySelector('code')?.textContent).toBe('const a = "x";');
    await waitFor(() => expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const'), { timeout: 15_000 });
    expect(container.querySelector('code')?.textContent).toBe('const a = "x";');
  }, 20_000);

  it('leaves unknown languages unhighlighted', async () => {
    const { container } = render(<MarkdownView source={'```nonsense\n<b>x</b>\n```'} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('code')?.textContent).toBe('<b>x</b>');
    expect(container.querySelector('code b')).toBeNull();
  });

  it('reveals spoilers on click', () => {
    const { container } = render(<MarkdownView source="||secret||" />);
    const sp = container.querySelector('.spoiler')!;
    expect(sp.className).not.toContain('is-shown');
    fireEvent.click(sp);
    expect(container.querySelector('.spoiler')!.className).toContain('is-shown');
  });

  it('renders pipe tables with aligned cells in a scroll container', () => {
    const { container } = render(<MarkdownView source={'| A | B |
|:-:|--:|
| **x** | <b>y</b> |'} />);
    expect(container.querySelector('.md-table-scroll table')).not.toBeNull();
    expect([...container.querySelectorAll('th')].map((c) => c.textContent)).toEqual(['A', 'B']);
    expect((container.querySelector('th') as HTMLElement).style.textAlign).toBe('center');
    expect((container.querySelectorAll('td')[1] as HTMLElement).style.textAlign).toBe('right');
    expect(container.querySelector('td strong')?.textContent).toBe('x');
    expect(container.querySelector('td b')).toBeNull();
  });
});
