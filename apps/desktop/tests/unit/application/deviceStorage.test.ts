import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, deviceStorage, installDeviceStorage } from '@renderer/application/ports/deviceStorage';
import { privacyDebug } from '@renderer/application/privacy/debugLog';
import { vi } from 'vitest';

describe('deviceStorage port', () => {
  afterEach(() => installDeviceStorage(createMemoryStorage()));

  it('is in-memory until an adapter is installed', () => {
    deviceStorage.setItem('k', 'v');
    expect(deviceStorage.getItem('k')).toBe('v');
    deviceStorage.removeItem('k');
    expect(deviceStorage.getItem('k')).toBeNull();
  });

  it('forwards to the installed adapter, including for the shared handle created earlier', () => {
    const adapter = createMemoryStorage();
    installDeviceStorage(adapter);
    deviceStorage.setItem('a', '1');
    expect(adapter.getItem('a')).toBe('1');
  });

  it('feeds the privacy debug switch', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    privacyDebug('off');
    expect(info).not.toHaveBeenCalled();
    deviceStorage.setItem('discordy.debug.privacy', '1');
    privacyDebug('on');
    expect(info).toHaveBeenCalledWith('[privacy] on', {});
    info.mockRestore();
  });
});
