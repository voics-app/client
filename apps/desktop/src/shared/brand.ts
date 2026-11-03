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
  /** Parent domain of every brand host (no scheme). Used for the CSP wildcard and the trusted-link list. */
  readonly baseDomain: string;
  readonly landingUrl: string;
  readonly apiUrl: string;
  readonly gatewayUrl: string;
  readonly cdnUrl: string;
}

export const BRAND: Brand = brand;
