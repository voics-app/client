/** The product identity the domain rules need (name, deep-link scheme, public hosts); each app installs its own at startup. */
export interface BrandConfig {
  readonly displayName: string;
  readonly protocolScheme: string;
  /** Parent domain of every brand host (no scheme). */
  readonly baseDomain: string;
  readonly landingUrl: string;
  readonly apiUrl: string;
}

let installed: BrandConfig | null = null;

/** Installs the app's brand; call once before any domain rule that reads it runs. */
export function installBrand(next: BrandConfig): void {
  installed = next;
}

export function brand(): BrandConfig {
  if (!installed) throw new Error('No brand installed: call installBrand() at app startup');
  return installed;
}
