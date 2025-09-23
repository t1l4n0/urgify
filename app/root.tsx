import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import stockAlertPreviewStyles from "./styles/stock-alert-preview.css?url";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <link rel="stylesheet" href={polarisStyles} />
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
