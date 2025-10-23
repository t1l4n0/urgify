import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  
  // Generate per-request correlation ID
  const requestId = request.headers.get("x-request-id") || (globalThis.crypto?.randomUUID?.() ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  responseHeaders.set("X-Request-Id", requestId);
  
  // Harden CSP for embedded Shopify Admin; prefer nonce + strict-dynamic
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://cdn.shopify.com https://admin.shopify.com",
    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://cdn.shopify.com",
    "connect-src 'self' https://*.shopify.com https://admin.shopify.com",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com https://*.shopify.com",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
  responseHeaders.set("Content-Security-Policy", csp);
  
  // Security headers centralized here (Built for Shopify)
  // Enforce HTTPS for one year across subdomains; eligible for preload
  responseHeaders.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  // Prevent MIME sniffing and restrict referrer
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  
  // Remove X-Frame-Options to allow embedding
  responseHeaders.delete("X-Frame-Options");
  
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
