import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";
import { processWebhookSafely } from "../utils/webhookHelpers";

// Timeout für Webhook-Authentifizierung (4 Sekunden, damit wir unter 5s bleiben)
const AUTH_TIMEOUT_MS = 4000;

export const action = async ({ request }: ActionFunctionArgs) => {
  const startTime = Date.now();
  
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") || crypto.randomUUID();
    const shopDomain = request.headers.get("X-Shopify-Shop-Domain");

    if (hmac) {
      // Authentifizierung mit Timeout, um 408-Fehler zu vermeiden
      let authResult: { admin: any; topic: string; shop: string; payload: any } | null = null;
      let authError: any = null;

      try {
        // Timeout-Wrapper für Authentifizierung
        const authPromise = authenticate.webhook(request);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Authentication timeout')), AUTH_TIMEOUT_MS)
        );

        authResult = await Promise.race([authPromise, timeoutPromise]) as any;
      } catch (error) {
        authError = error;
        
        // HMAC-Validierungsfehler sofort zurückgeben
        if (error instanceof Response && error.status === 401) {
          return error;
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('HMAC') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('invalid signature') ||
          errorMessage.includes('Invalid HMAC') ||
          errorMessage.includes('authentication')
        ) {
          console.error("PRODUCTS/CREATE: HMAC validation failed");
          return json({ error: 'Invalid HMAC' }, { status: 401 });
        }
        
        // Timeout oder andere Fehler: 200 zurückgeben, Verarbeitung im Hintergrund versuchen
        console.warn("PRODUCTS/CREATE: Authentication timeout or error, processing in background", {
          error: errorMessage,
          shopDomain,
          webhookId
        });
      }

      // 200-Antwort sofort zurückgeben (innerhalb von 1-2 Sekunden)
      const responseTime = Date.now() - startTime;
      if (responseTime > 3000) {
        console.warn(`PRODUCTS/CREATE: Slow response time: ${responseTime}ms`);
      }

      // Asynchrone Verarbeitung im Hintergrund starten
      if (authResult && authResult.shop && authResult.admin) {
        const { admin, topic, shop, payload } = authResult;
        
        if (topic?.toUpperCase() !== "PRODUCTS/CREATE") {
          console.warn(`Unexpected topic at /webhooks/products/create: ${topic}`);
        }

        // Asynchrone, idempotente Verarbeitung im Hintergrund
        Promise.resolve().then(async () => {
          try {
            await processWebhookSafely(
              webhookId,
              topic || WEBHOOK_EVENTS.PRODUCTS_CREATE,
              shop,
              payload,
              async () => {
                console.log(`📦 Product Create Webhook empfangen für Shop: ${shop}`);
                
                const webhookProcessor = new WebhookProcessor(shop, admin);
                const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.PRODUCTS_CREATE, payload);
                
                if (!result.success) {
                  console.error("❌ Product create processing failed:", result.error);
                  throw new Error(result.error || 'Product create processing failed');
                }
                
                console.log("✅ Product create processed successfully");
              }
            );
          } catch (error) {
            console.error("❌ Background product create processing error:", error);
          }
        }).catch((error) => {
          console.error("❌ Background promise error:", error);
        });
      } else if (authError && shopDomain) {
        // Fallback: Versuche Verarbeitung mit Shop-Domain, wenn Auth fehlgeschlagen ist
        console.warn(`PRODUCTS/CREATE: No admin context for shop ${shopDomain}, skipping processing`);
      }
    } else {
      console.log("PRODUCTS/CREATE: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK zurückgeben (innerhalb von 4 Sekunden)
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    // Prüfe ob es ein HMAC-Validierungsfehler ist
    if (err instanceof Response && err.status === 401) {
      return err;
    }
    
    // Prüfe Error-Message nach HMAC-spezifischen Fehlern
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (
      errorMessage.includes('HMAC') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid signature') ||
      errorMessage.includes('Invalid HMAC') ||
      errorMessage.includes('authentication')
    ) {
      console.error("PRODUCTS/CREATE: HMAC validation failed");
      return json({ error: 'Invalid HMAC' }, { status: 401 });
    }
    
    // Andere Fehler → HTTP 200 (um Retries zu vermeiden)
    console.error("PRODUCTS/CREATE: webhook error:", err);
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
