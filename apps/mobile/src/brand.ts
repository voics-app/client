import { installBrand } from '@discordy/core/domain/brandConfig';
import brand from '../../desktop/brand.json';

export const BRAND = brand;

// Domain rules from @discordy/core read the product identity from the installed brand.
installBrand(BRAND);
