import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import type { HeadersFunction } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import stockAlertPreviewStyles from "./styles/stock-alert-preview.css?url";

export default function App() {
  // Get API key from environment (only available on server)
  // Always render meta tag with suppressHydrationWarning to prevent React error 418
  // App Bridge reads this meta tag before React hydrates, so empty value on client is fine
  // Using typeof window check ensures apiKey is only set on server
  const apiKey = typeof window === "undefined" && typeof process !== "undefined" && process.env?.SHOPIFY_API_KEY 
    ? process.env.SHOPIFY_API_KEY 
    : "";

  return (
    <html suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* App Bridge API Key - Required for app-bridge.js initialization */}
        {/* This meta tag is read by App Bridge before React hydrates */}
        {/* suppressHydrationWarning prevents React error 418 - value differs on server/client */}
        {/* The meta tag is always rendered, but content is only set on server */}
        <meta 
          name="shopify-api-key" 
          content={apiKey} 
          suppressHydrationWarning 
        />
        {/* App Bridge - MUST be the first script tag (Shopify best practice) */}
        {/* Load synchronously without async/defer to ensure proper initialization */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        {/* Polaris JavaScript - Required for Web Components initialization */}
        {/* Load synchronously after App Bridge, before React renders */}
        {/* Without this script, Polaris Web Components won't be upgraded and appear as plain text */}
        <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
        <link rel="preconnect" href="https://cdn.shopify.com" />
        {/* Polaris CSS - Required for styling Web Components */}
        <link rel="stylesheet" href="https://cdn.shopify.com/shopifycloud/polaris.css" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <link rel="stylesheet" href={stockAlertPreviewStyles} />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <div style={{ minHeight: '100vh' }}>
          <Outlet />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const headers: HeadersFunction = (args) => {
  const shopify = boundary.headers(args);
  return {
    ...shopify,
  };
};

export function ErrorBoundary({ error }: { error: Error }) {
  const errorMessage = error?.message || "Unknown error";
  const errorStack = error?.stack || "No stack trace available";
  
  console.error(JSON.stringify({ 
    level: "error", 
    msg: "client_error_boundary", 
    error: errorMessage,
    stack: errorStack 
  }, null, 0));

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Unerwarteter Fehler</title>
      </head>
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h1>Unerwarteter Fehler</h1>
          <p>Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es später erneut.</p>
          {process.env.NODE_ENV === "development" && (
            <details style={{ marginTop: "1rem" }}>
              <summary>Fehlerdetails (nur in Entwicklung)</summary>
              <pre style={{ 
                background: "#f5f5f5", 
                padding: "1rem", 
                overflow: "auto",
                fontSize: "0.875rem"
              }}>
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </body>
    </html>
  );
}
