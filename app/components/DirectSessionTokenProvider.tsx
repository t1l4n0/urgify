import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { requestSessionToken } from "../utils/authenticatedFetch";

interface SessionTokenContextType {
  sessionToken: string | null;
  isLoading: boolean;
  error: string | null;
  refreshToken: () => Promise<string | null>;
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

  const persistToken = useCallback((token: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("shopify_session_token", token);
    }
  }, []);

  const refreshTokenInternal = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<string | null> => {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        let token = await requestSessionToken();

        if (!token && typeof window !== "undefined") {
          token = sessionStorage.getItem("shopify_session_token");
        }

        if (!token && initialToken) {
          token = initialToken;
        }

        if (!token) {
          throw new Error("No session token available");
        }

        setSessionToken(token);
        persistToken(token);

        return token;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Session token refresh failed:", err);
        return null;
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [initialToken, persistToken],
  );

  const refreshToken = useCallback(async () => {
    return refreshTokenInternal({ silent: false });
  }, [refreshTokenInternal]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (initialToken) {
        setSessionToken(initialToken);
        persistToken(initialToken);
        setIsLoading(false);
      }

      if (isMounted) {
        await refreshTokenInternal({ silent: !!initialToken });
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [initialToken, persistToken, refreshTokenInternal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFocus = () => {
      refreshTokenInternal({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshTokenInternal({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTokenInternal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const interval = window.setInterval(() => {
      refreshTokenInternal({ silent: true });
    }, 45 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshTokenInternal]);

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
