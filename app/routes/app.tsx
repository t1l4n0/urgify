import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, useLocation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider, Frame, Navigation } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json" with { type: "json" };
import { TitleBar } from "@shopify/app-bridge-react";
import { ServerSessionTokenProvider } from "../components/ServerSessionTokenProvider";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // host wird von der Library aus der URL gelesen; hier nicht benötigt

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


	// Use session token from Shopify session; do not fabricate fallbacks
	const sessionToken = session.token;

  const result = { 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    shop: session.shop, 
    hasActiveSub,
    isAppEmbeddingEnabled,
    // Session token data for App Bridge
    sessionToken: sessionToken,
    isOnline: session.isOnline,
  };


  return result;
};

export default function App() {
  const { apiKey, shop, sessionToken, isOnline } = useLoaderData<typeof loader>();
  const location = useLocation();


  return (
    <AppProvider 
      isEmbeddedApp 
      apiKey={apiKey}
      shop={shop}
      // Enable session token authentication
      forceRedirect={true}
      // Pass session token to App Bridge
      sessionToken={sessionToken}
    >
      <ServerSessionTokenProvider initialToken={sessionToken}>
        <PolarisAppProvider i18n={enTranslations}>
          <Frame
            navigation={
              <Navigation location={location.pathname}>
                <Navigation.Section
                  items={[
                    {
                      label: "Dashboard",
                      url: "/app",
                      selected: location.pathname === "/app" || location.pathname === "/app/",
                    },
                    {
                      label: "Stock Alerts",
                      url: "/app/stock-alerts",
                      selected: location.pathname.startsWith("/app/stock-alerts"),
                    },
                    {
                      label: "Pricing",
                      url: "/app/pricing",
                      selected: location.pathname.startsWith("/app/pricing"),
                    },
                  ]}
                />
              </Navigation>
            }
          >
            <TitleBar
              title={
                location.pathname === "/app/stock-alerts" ? "Stock Alerts" :
                "Urgify"
              }
            />
            <Outlet />
          </Frame>
        </PolarisAppProvider>
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
