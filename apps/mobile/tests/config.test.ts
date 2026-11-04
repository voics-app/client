import brand from '../../desktop/brand.json';
import config from '../app.config';

describe('app.config', () => {
  it('takes name, scheme and bundle id from brand.json', () => {
    expect(config.name).toBe(brand.displayName);
    expect(config.scheme).toBe(brand.protocolScheme);
    expect(config.ios?.bundleIdentifier).toBe(brand.appId);
    expect(config.android?.package).toBe(brand.appId);
  });
});
