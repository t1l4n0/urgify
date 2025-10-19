import React, { createContext, useContext, useState, useEffect } from 'react';

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

export function ServerSessionTokenProvider({ children, initialToken }: SessionTokenProviderProps) {
  const [sessionToken, setSessionToken] = useState<string | null>(initialToken || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Store token in session storage when it changes
  React.useEffect(() => {
    if (sessionToken) {
      sessionStorage.setItem('shopify_session_token', sessionToken);
    }
  }, [sessionToken]);

  const refreshToken = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // For now, just use the initial token from server
      // In a real implementation, you might want to refresh this
      if (initialToken) {
        setSessionToken(initialToken);
        sessionStorage.setItem('shopify_session_token', initialToken);
      } else {
        throw new Error('No initial session token provided');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Session token refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

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
