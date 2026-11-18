/** The credentials a device keeps between launches (OS keychain on desktop, the iOS Keychain on mobile). */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  deviceId: string | null;
  /** Saved before refresh and kept until the successor credentials are durable. */
  refreshRequestId?: string;
}
