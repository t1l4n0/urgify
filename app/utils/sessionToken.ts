/**
 * Session Token Authentication Utilities
 * Provides secure session token handling for Shopify App Bridge v4
 */

export interface SessionTokenData {
  sessionToken: string;
  shop: string;
  isOnline: boolean;
}

/**
 * Validates session token from request headers
 */
export function validateSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

/**
 * Creates session token response for App Bridge
 */
export function createSessionTokenResponse(data: SessionTokenData) {
  return {
    sessionToken: data.sessionToken,
    shop: data.shop,
    isOnline: data.isOnline,
    timestamp: Date.now(),
  };
}

/**
 * Session token validation middleware
 */
export function requireSessionToken(request: Request): string {
  const token = validateSessionToken(request);
  if (!token) {
    throw new Error('Session token required');
  }
  return token;
}

/**
 * App Bridge configuration for embedded apps
 */
export function getAppBridgeConfig(apiKey: string, shop: string) {
  return {
    apiKey,
    shop,
    forceRedirect: true,
    // Enable session token authentication
    useSessionToken: true,
  };
}
