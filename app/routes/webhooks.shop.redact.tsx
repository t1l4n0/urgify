import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { processWebhookSafely } from "../utils/webhookHelpers";
import { webhookShopRedactSchema } from "../utils/validation";
import { handleShopRedact } from "../utils/gdpr";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const webhookId = request.headers.get("X-Shopify-Webhook-Id") || randomUUID();
      const { topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "SHOP/REDACT") {
        console.warn(`Unexpected topic at /app/webhooks/shop/redact: ${topic}`);
      }

      if (shop && payload) {
        Promise.resolve().then(async () => {
          await processWebhookSafely(
            webhookId,
            topic,
            shop,
            payload,
            async () => {
              const validatedPayload = webhookShopRedactSchema.parse(payload);
              await handleShopRedact(shop, validatedPayload);
            }
          );
        });
      }
    } else {
      console.log("SHOP/REDACT: no HMAC (test request) → respond 200");
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
      console.error("SHOP/REDACT: HMAC validation failed");
      return json({ error: 'Invalid HMAC' }, { status: 401 });
    }
    
    // Andere Fehler → HTTP 200 (um Retries zu vermeiden)
    console.error("SHOP/REDACT: webhook error:", err);
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
