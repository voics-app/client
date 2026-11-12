import Constants from 'expo-constants';
import { installBrand } from '@discordy/core/domain/brandConfig';
import brand from '../../desktop/brand.json';

/** The public CDN origin: the build's `extra.cdnUrl` (a test backend in the `simulator` profile), else the brand's. */
const cdn: unknown = Constants.expoConfig?.extra?.cdnUrl;

export const BRAND = { ...brand, cdnUrl: typeof cdn === 'string' && cdn !== '' ? cdn : brand.cdnUrl };

// Domain rules from @discordy/core read the product identity from the installed brand.
installBrand(BRAND);
