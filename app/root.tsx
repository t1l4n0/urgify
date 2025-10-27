import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import type { HeadersFunction } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import stockAlertPreviewStyles from "./styles/stock-alert-preview.css?url";
import { trackCoreWebVitals } from "./utils/performance";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // Track Core Web Vitals
    trackCoreWebVitals();
  }, []);

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <link rel="stylesheet" href={stockAlertPreviewStyles} />
        <Meta />
        <Links />
      </head>
      <body>
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
