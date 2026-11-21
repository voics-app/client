import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryImport } from '../../../src/renderer/interface/shared/ui/LazyFeature';

afterEach(() => vi.useRealTimers());
describe('retryImport', () => {
  it('backs off after failures before returning a successful import', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue('loaded');
    const result = retryImport(load, [250, 500]);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('surfaces the final failure', async () => {
    const error = new Error('offline');
    await expect(retryImport(() => Promise.reject(error), [])).rejects.toBe(error);
  });
});
