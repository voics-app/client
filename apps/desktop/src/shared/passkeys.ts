/** Only public ceremony options and signed credentials cross this bridge. */
export interface PasskeySite {
  origin: string;
  rpId: string;
}

export interface PasskeyRequest {
  id: string;
  kind: 'create' | 'get';
  publicKey: Record<string, unknown>;
}

export type PasskeyResult =
  | { ok: true; credential: Record<string, unknown> }
  | { ok: false; reason: 'cancelled' | 'timeout' | 'unavailable' | 'failed' };
