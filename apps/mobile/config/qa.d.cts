export function qaConfig(
  env: Record<string, string | undefined>,
  brand: { appId: string; displayName: string; protocolScheme: string },
): null | { apiUrl: string; gatewayUrl: string; cdnUrl: string; appId: string; name: string; scheme: string };
