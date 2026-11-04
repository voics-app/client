export type ConnectionProfileId = 'production' | 'local' | 'custom';

export interface ConnectionProfile {
  id: ConnectionProfileId;
  apiUrl: string;
  gatewayUrl: string;
  cdnUrl: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  updateFeedUrl: string;
  connection: ConnectionProfile;
  e2eTest: boolean;
}
