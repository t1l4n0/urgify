import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, useLocation, Link } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json" with { type: "json" };
import { TitleBar } from "@shopify/app-bridge-react";

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
      (sub: any) => sub.status === "ACTIVE" && new Date(sub.currentPeriodEnd) > new Date()
    );
  } catch (_err) {
    hasActiveSub = false;
  }

  // App embedding is managed through Theme Editor, always show as enabled
  isAppEmbeddingEnabled = true;

  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    shop: session.shop, 
    hasActiveSub,
    isAppEmbeddingEnabled
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* App Bridge Navigation Menu */}
      <ui-nav-menu>
        <Link to="/app" rel="home">Home</Link>
        <Link to="/app/stock-alerts">Stock Alerts</Link>
      </ui-nav-menu>
      <PolarisAppProvider i18n={enTranslations}>
        <Frame>
          <TitleBar
            title={
              location.pathname === "/app/stock-alerts" ? "Stock Alerts" :
              "Urgify"
            }
          />
          <Outlet />
        </Frame>
      </PolarisAppProvider>
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
