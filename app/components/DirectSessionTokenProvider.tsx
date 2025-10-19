import React, { createContext, useContext, useEffect, useState } from 'react';

interface SessionTokenContextType {
  sessionToken: string | null;
  isLoading: boolean;
  error: string | null;
  refreshToken: () => Promise<void>;
}

const SessionTokenContext = createContext<SessionTokenContextType | null>(null);

export function useSessionToken() {
  const context = useContext(SessionTokenContext);
  if (!context) {
    throw new Error('useSessionToken must be used within a SessionTokenProvider');
  }
  return context;
}

interface SessionTokenProviderProps {
  children: React.ReactNode;
  initialToken?: string | null;
}

export function DirectSessionTokenProvider({ children, initialToken }: SessionTokenProviderProps) {
  const [sessionToken, setSessionToken] = useState<string | null>(initialToken || null);
  const [isLoading, setIsLoading] = useState(!initialToken);
  const [error, setError] = useState<string | null>(null);

  const refreshToken = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to get session token from the main app route
      const response = await fetch('/app');
      console.log('App route response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse the HTML response to extract session token from script tag
      const html = await response.text();
      console.log('App route HTML length:', html.length);
      
      // Try to extract session token from the page data
      const scriptMatch = html.match(/window\.__remixContext\s*=\s*({.*?});/);
      if (scriptMatch) {
        try {
          const context = JSON.parse(scriptMatch[1]);
          const loaderData = context?.state?.loaderData;
          const appData = loaderData?.['routes/app'];
          
          if (appData?.sessionToken) {
            setSessionToken(appData.sessionToken);
            sessionStorage.setItem('shopify_session_token', appData.sessionToken);
            return;
          }
        } catch (parseError) {
          console.warn('Failed to parse Remix context:', parseError);
        }
      }
      
      // Fallback: try to get from session storage
      const storedToken = sessionStorage.getItem('shopify_session_token');
      if (storedToken) {
        setSessionToken(storedToken);
        return;
      }
      
      throw new Error('No session token found in app route');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Session token refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // If no initial token, try to get from server
    if (!initialToken) {
      refreshToken();
    }
  }, [initialToken]);

  const value: SessionTokenContextType = {
    sessionToken,
    isLoading,
    error,
    refreshToken,
  };

  return (
    <SessionTokenContext.Provider value={value}>
      {children}
    </SessionTokenContext.Provider>
  );
}
