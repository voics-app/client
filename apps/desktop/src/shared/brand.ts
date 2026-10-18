import brand from '../../brand.json';

/** The single source of the product name and identity. Edit `apps/desktop/brand.json`, nothing else. */
export interface Brand {
  readonly displayName: string;
  readonly productName: string;
  readonly shortName: string;
  readonly appId: string;
  readonly protocolScheme: string;
  readonly description: string;
  readonly publisher: string;
  readonly updateFeedHost: string;
}

export const BRAND: Brand = brand;
