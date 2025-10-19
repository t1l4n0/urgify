/**
 * Authenticated Fetch Utility
 * Provides secure API calls using session token authentication
 */

export interface AuthenticatedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Makes authenticated API calls using session token
 */
export async function authenticatedFetch(
  url: string, 
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', body, headers = {} } = options;
  
  // Get session token from App Bridge or fallback to session storage
  let sessionToken = await getSessionToken();
  
  // Fallback: try to get from session storage
  if (!sessionToken) {
    sessionToken = sessionStorage.getItem('shopify_session_token');
  }
  
  if (!sessionToken) {
    throw new Error('Session token not available');
  }


  const requestOptions: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    requestOptions.body = JSON.stringify(body);
  }

  return fetch(url, requestOptions);
}

/**
 * Gets session token from App Bridge
 */
async function getSessionToken(): Promise<string | null> {
  try {
    // Check if we're in an embedded app context
    if (typeof window === 'undefined') {
      return null;
    }

    // Method 1: Try to get from session storage first (most reliable)
    const storedToken = sessionStorage.getItem('shopify_session_token');
    if (storedToken) {
      return storedToken;
    }

    // Method 2: Try multiple methods to get session token from App Bridge v4
    const appBridge = (window as any).shopify;
    
    if (!appBridge) {
      return null;
    }

    // Method 3: Direct session token access
    if (appBridge?.config?.sessionToken) {
      return appBridge.config.sessionToken;
    }

    // Method 4: App Bridge v4 getSessionToken method
    if (appBridge?.getSessionToken) {
      try {
        const token = await appBridge.getSessionToken();
        if (token) {
          return token;
        }
      } catch (error) {
        // Silent fail
      }
    }

    // Method 5: Try to get from App Bridge context
    if (appBridge?.context?.sessionToken) {
      return appBridge.context.sessionToken;
    }

    // Method 6: Fallback to global state
    if (appBridge?.sessionToken) {
      return appBridge.sessionToken;
    }
    return null;
  } catch (error) {
    console.error('Failed to get session token:', error);
    return null;
  }
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