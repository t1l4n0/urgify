import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, useLocation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { ServerSessionTokenProvider } from "../components/ServerSessionTokenProvider";
import { getLocale } from "../locales";
import { BillingManager } from "../utils/billing";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let hasActiveSub = false;
  let isAppEmbeddingEnabled = false;
  
  try {
    const billingManager = new BillingManager(session.shop, admin);
    const subscriptionStatus = await billingManager.getSubscriptionStatus();
    
    // Debug logging
    console.log("[app.tsx] Subscription status check:", {
      shop: session.shop,
      hasActiveSubscription: subscriptionStatus.hasActiveSubscription,
      isTrialActive: subscriptionStatus.isTrialActive,
      subscription: subscriptionStatus.subscription,
    });
    
    // Show menu items if there's an active subscription OR an active trial
    hasActiveSub = subscriptionStatus.hasActiveSubscription || subscriptionStatus.isTrialActive;
    
    console.log("[app.tsx] hasActiveSub result:", hasActiveSub);
  } catch (error) {
    console.error("Error checking subscription status in app.tsx:", error);
    hasActiveSub = false;
  }

  // App embedding is managed through Theme Editor, always show as enabled
  isAppEmbeddingEnabled = true;

  // Get locale for i18n support
  const locale = getLocale(request);

  const result = { 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    hasActiveSub,
    isAppEmbeddingEnabled,
    locale,
  };

  console.log("[app.tsx] Returning result:", JSON.stringify(result, null, 2));

  return result;
};

export default function App() {
  const loaderData = useLoaderData<typeof loader>();
  const { apiKey } = loaderData;
  const location = useLocation();

  const pageTitle = 
    location.pathname === "/app/stock-alerts" ? "Stock Alerts" :
    location.pathname === "/app/popup" ? "PopUp" :
    location.pathname === "/app/cart-upsells" ? "Cart Upsells" :
    location.pathname === "/app/metrics" ? "Web Vitals Metrics" :
    "Urgify";

  return (
    <AppProvider 
      isEmbeddedApp 
      apiKey={apiKey}
    >
      <NavMenu>
        <a href="/app" rel="home">Home</a>
        <a href="/app/stock-alerts">Stock Alerts</a>
        <a href="/app/cart-upsells">Cart Upsells</a>
        <a href="/app/popup">PopUp</a>
      </NavMenu>
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
