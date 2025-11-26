/**
 * Authenticated Fetch Utility
 * Provides secure API calls using session token authentication
 */

export interface AuthenticatedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  sessionToken?: string | null; // Optional: Pass session token directly
}

/**
 * Makes authenticated API calls using session token
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', body, headers = {}, sessionToken: providedToken } = options;
  
  // Use provided token, or try to obtain a fresh token (falls back to sessionStorage internally)
  const sessionToken = providedToken || await getSessionTokenInternal();
  
  if (!sessionToken) {
    throw new Error('Session token not available');
  }


  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${sessionToken}`,
    ...headers,
  };

  const requestOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    if (body instanceof FormData) {
      requestOptions.body = body;
      // Browsers automatically set the correct Content-Type with boundary for FormData
    } else if (body instanceof URLSearchParams) {
      requestOptions.body = body.toString();
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      }
    } else if (typeof body === 'string' || body instanceof Blob) {
      requestOptions.body = body as BodyInit;
    } else {
      requestOptions.body = JSON.stringify(body);
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
    }
  }

  return fetch(url, requestOptions);
}

async function getSessionTokenInternal(): Promise<string | null> {
  try {
    if (typeof window === 'undefined') {
      return null;
    }

    // Method 1: Use cached token to avoid extra App Bridge calls
    const storedToken = sessionStorage.getItem('shopify_session_token');
    if (storedToken) {
      return storedToken;
    }

    // Method 2: Ask App Bridge for a fresh token (v4 idToken preferred)
    const tokenFromAppBridge = await getTokenFromAppBridge();
    if (tokenFromAppBridge) {
      return tokenFromAppBridge;
    }

    // Method 3: Check remaining global fallbacks
    const fallbackToken = getTokenFromLegacyGlobals();
    if (fallbackToken) {
      sessionStorage.setItem('shopify_session_token', fallbackToken);
      return fallbackToken;
    }

    return null;
  } catch (error) {
    console.error('Failed to get session token:', error);
    return null;
  }
}

export async function requestSessionToken(): Promise<string | null> {
  return getSessionTokenInternal();
}

async function getTokenFromAppBridge(): Promise<string | null> {
  try {
    if (typeof window === 'undefined') {
      return null;
    }

    const appBridgeInstance =
      (window as any).__shopify_app_bridge__ ||
      (window as any).shopify ||
      null;

    if (!appBridgeInstance) {
      return null;
    }

    if (typeof appBridgeInstance.idToken === 'function') {
      const token = await appBridgeInstance.idToken();
      if (token) {
        sessionStorage.setItem('shopify_session_token', token);
        return token;
      }
    }

    if (typeof appBridgeInstance.getSessionToken === 'function') {
      const token = await appBridgeInstance.getSessionToken();
      if (token) {
        sessionStorage.setItem('shopify_session_token', token);
        return token;
      }
    }

    return null;
  } catch (error) {
    console.warn('Unable to acquire session token from App Bridge:', error);
    return null;
  }
}

function getTokenFromLegacyGlobals(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const appBridgeInstance =
    (window as any).__shopify_app_bridge__ ||
    (window as any).shopify ||
    null;

  if (!appBridgeInstance) {
    return null;
  }

  const candidates = [
    appBridgeInstance?.config?.sessionToken,
    appBridgeInstance?.context?.sessionToken,
    appBridgeInstance?.sessionToken,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      sessionStorage.setItem('shopify_session_token', candidate);
      return candidate;
    }
  }

  return null;
}

/**
 * Makes authenticated GraphQL requests
 */
export async function authenticatedGraphQL(
  query: string,
  variables?: Record<string, any>
): Promise<Response> {
  return authenticatedFetch('/api/graphql', {
    method: 'POST',
    body: {
      query,
      variables,
    },
  });
}

/**
 * Makes authenticated REST API requests
 */
export async function authenticatedREST(
  endpoint: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  return authenticatedFetch(`/api/authenticated-fetch?url=${encodeURIComponent(endpoint)}`, {
    method: options.method || 'GET',
    body: options.body,
    headers: options.headers,
  });
}