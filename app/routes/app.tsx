import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, useLocation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { ServerSessionTokenProvider } from "../components/ServerSessionTokenProvider";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let hasActiveSub = false;
  let isAppEmbeddingEnabled = false;
  
  try {
    const response = await admin.graphql(`#graphql
      query {
        currentAppInstallation {
          activeSubscriptions { id name status currentPeriodEnd }
        }
      }
    `);
    const { data } = await response.json();
    const activeSubs = data?.currentAppInstallation?.activeSubscriptions ?? [];
    hasActiveSub = activeSubs.some(
      (sub: any) => 
        (sub.status === "ACTIVE" && new Date(sub.currentPeriodEnd) > new Date()) ||
        (sub.status === "TRIAL" && new Date(sub.currentPeriodEnd) > new Date())
    );
  } catch (_err) {
    hasActiveSub = false;
  }

  // App embedding is managed through Theme Editor, always show as enabled
  isAppEmbeddingEnabled = true;

  const result = { 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    hasActiveSub,
    isAppEmbeddingEnabled,
  };


  return result;
};

export default function App() {
  const { apiKey, hasActiveSub } = useLoaderData<typeof loader>();
  const location = useLocation();


  const pageTitle = 
    location.pathname === "/app/stock-alerts" ? "Stock Alerts" :
    location.pathname === "/app/popup" ? "PopUp" :
    location.pathname === "/app/metrics" ? "Web Vitals Metrics" :
    "Urgify";

  return (
    <AppProvider 
      isEmbeddedApp 
      apiKey={apiKey}
    >
      <ui-nav-menu>
        <a href="/app" rel="home">Home</a>
        {hasActiveSub && <a href="/app/stock-alerts">Stock Alerts</a>}
        {hasActiveSub && <a href="/app/popup">PopUp</a>}
      </ui-nav-menu>
      <ServerSessionTokenProvider initialToken={null}>
        <ui-title-bar title={pageTitle} />
        <Outlet />
      </ServerSessionTokenProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
