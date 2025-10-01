import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
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
