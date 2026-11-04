import { installBrand } from '@discordy/core/domain/brandConfig';
import { BRAND } from '@shared/brand';

// Imported first by the renderer entry: domain rules read the product identity from the installed brand.
installBrand(BRAND);
