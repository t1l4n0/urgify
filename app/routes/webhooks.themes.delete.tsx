import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { WebhookProcessor, WEBHOOK_EVENTS } from "../utils/webhooks";
import { processWebhookSafely } from "../utils/webhookHelpers";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const webhookId = request.headers.get("X-Shopify-Webhook-Id") || crypto.randomUUID();
      
      try {
        // Verifiziertes Webhook-Auth (HMAC, Shop, Topic, Payload)
        const { admin, topic, shop, payload } = await authenticate.webhook(request);

        if (topic?.toUpperCase() !== "THEMES/DELETE") {
          console.warn(`Unexpected topic at /webhooks/themes/delete: ${topic}`);
        }

        // Rate-Limiting für Webhooks entfernt: Verarbeitung läuft asynchron,
        // Shopify hat eigene Rate-Limits, und Idempotenz verhindert doppelte Verarbeitung

        if (shop && admin) {
          // Asynchrone, idempotente Verarbeitung im Hintergrund; 200 sofort
          Promise.resolve().then(async () => {
            await processWebhookSafely(
              webhookId,
              topic || WEBHOOK_EVENTS.THEMES_DELETE,
              shop,
              payload,
              async () => {
                console.log(`🎨 Theme Delete Webhook empfangen für Shop: ${shop}`);
                
                // Use WebhookProcessor for robust handling
                const webhookProcessor = new WebhookProcessor(shop, admin);
                const result = await webhookProcessor.processWebhook(WEBHOOK_EVENTS.THEMES_DELETE, payload);
                
                if (!result.success) {
                  console.error("❌ Theme delete processing failed:", result.error);
                  throw new Error(result.error || 'Theme delete processing failed');
                }
                
                console.log("✅ Theme delete processed successfully");
              }
            );
          }).catch((error) => {
            console.error("❌ Background theme delete processing error:", error);
          });
        } else {
          // The admin context isn't returned if the webhook fired after a shop was uninstalled.
          console.warn(`❌ Theme delete webhook failed: No admin context for shop ${shop}`);
        }
      } catch (authError) {
        // Spezielle Behandlung für Authentifizierungsfehler
        if (authError instanceof Response && authError.status === 401) {
          // HMAC ungültig → HTTP 401 zurückgeben
          throw authError;
        }
        
        const errorMessage = authError instanceof Error ? authError.message : String(authError);
        if (
          errorMessage.includes('HMAC') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('invalid signature') ||
          errorMessage.includes('Invalid HMAC') ||
          errorMessage.includes('authentication')
        ) {
          console.error("THEMES/DELETE: HMAC validation failed");
          return json({ error: 'Invalid HMAC' }, { status: 401 });
        }
        
        // Andere Authentifizierungsfehler → 200 (um Retries zu vermeiden)
        console.error("THEMES/DELETE: authentication error:", authError);
      }
    } else {
      console.log("THEMES/DELETE: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    // Prüfe ob es ein HMAC-Validierungsfehler ist
    if (err instanceof Response && err.status === 401) {
      // HMAC ungültig → HTTP 401 zurückgeben
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
      console.error("THEMES/DELETE: HMAC validation failed");
      return json({ error: 'Invalid HMAC' }, { status: 401 });
    }
    
    // Andere Fehler → HTTP 200 (um Retries zu vermeiden)
    console.error("THEMES/DELETE: webhook error:", err);
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
