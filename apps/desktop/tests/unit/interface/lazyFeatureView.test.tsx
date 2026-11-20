// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LazyFeature } from '../../../src/renderer/interface/shared/ui/LazyFeature';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('lets the user retry after the chunk exhausts its automatic retries', async () => {
  vi.useFakeTimers();
  let online = false;
  const load = vi.fn(async () => {
    if (!online) throw new Error('unavailable');
    return { default: () => <div>Feature loaded</div> };
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<LazyFeature load={load} props={{}} close={() => {}} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByRole('alert').textContent).toContain('Could not load this feature');
  expect(load).toHaveBeenCalledTimes(4);
  online = true;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
  expect(screen.getByText('Feature loaded')).toBeTruthy();
  error.mockRestore();
});
