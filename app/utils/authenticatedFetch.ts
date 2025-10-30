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
  
  // Use provided token, or get session token from App Bridge or fallback to session storage
  let sessionToken = providedToken || await getSessionToken();
  
  // Fallback: try to get from session storage
  if (!sessionToken) {
    sessionToken = sessionStorage.getItem('shopify_session_token');
  }
  
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

    // Method 2: Try to get from App Bridge React context (most reliable for v4)
    // App Bridge v4 uses idToken() instead of getSessionToken()
    // We need to try accessing it through the global context or window object
    
    // Try App Bridge v4 through @shopify/app-bridge-react
    // The AppBridge instance is available through window.__shopify_app_bridge__
    const appBridgeInstance = (window as any).__shopify_app_bridge__;
    
    if (appBridgeInstance?.idToken) {
      try {
        const token = await appBridgeInstance.idToken();
        if (token) {
          sessionStorage.setItem('shopify_session_token', token);
          return token;
        }
      } catch (error) {
        console.warn('Failed to get session token from App Bridge instance:', error);
      }
    }

    // Method 3: Try multiple methods to get session token from App Bridge v4
    const appBridge = (window as any).shopify;
    
    if (appBridge) {
      // Method 4: App Bridge v4 idToken method (replaces getSessionToken)
      if (appBridge?.idToken) {
        try {
          const token = await appBridge.idToken();
          if (token) {
            sessionStorage.setItem('shopify_session_token', token);
            return token;
          }
        } catch (error) {
          console.warn('Failed to get session token from shopify.idToken:', error);
        }
      }
      
      // Fallback: Try getSessionToken for older versions
      if (appBridge?.getSessionToken) {
        try {
          const token = await appBridge.getSessionToken();
          if (token) {
            sessionStorage.setItem('shopify_session_token', token);
            return token;
          }
        } catch (error) {
          console.warn('Failed to get session token from shopify.getSessionToken:', error);
        }
      }

      // Method 5: Direct session token access
      if (appBridge?.config?.sessionToken) {
        const token = appBridge.config.sessionToken;
        if (token) {
          sessionStorage.setItem('shopify_session_token', token);
          return token;
        }
      }

      // Method 6: Try to get from App Bridge context
      if (appBridge?.context?.sessionToken) {
        const token = appBridge.context.sessionToken;
        if (token) {
          sessionStorage.setItem('shopify_session_token', token);
          return token;
        }
      }

      // Method 7: Fallback to global state
      if (appBridge?.sessionToken) {
        const token = appBridge.sessionToken;
        if (token) {
          sessionStorage.setItem('shopify_session_token', token);
          return token;
        }
      }
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