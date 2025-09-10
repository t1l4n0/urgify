import { useAppBridge } from "@shopify/app-bridge-react";
import type { ClientApplication } from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge/utilities";
import { useEffect, useState } from "react";

export interface AuthenticatedFetchOptions extends RequestInit {
  endpoint: string;
  method?: string;
  body?: any;
}

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  const [isAppBridgeReady, setIsAppBridgeReady] = useState(false);

  useEffect(() => {
    // Warte bis App Bridge vollständig geladen ist
    const checkAppBridge = () => {
      if (app && typeof app === 'object' && 'subscribe' in app) {
        setIsAppBridgeReady(true);
      } else {
        setTimeout(checkAppBridge, 100);
      }
    };
    
    checkAppBridge();
  }, [app]);

  return async function authenticatedFetch({
    endpoint,
    method = "GET",
    body,
    ...fetchOptions
  }: AuthenticatedFetchOptions) {
    // Warte bis App Bridge bereit ist
    if (!isAppBridgeReady) {
      throw new Error("App Bridge is not ready yet");
    }

    const token = await getSessionToken(app as unknown as ClientApplication<any>);

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...fetchOptions.headers,
    };

    const config: RequestInit = {
      method,
      headers,
      ...fetchOptions,
    };

    if (body && method !== "GET") {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, config);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  };
}
