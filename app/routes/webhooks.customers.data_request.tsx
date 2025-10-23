import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { processWebhookSafely } from "../utils/webhookHelpers";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const webhookId = request.headers.get("X-Shopify-Webhook-Id") || crypto.randomUUID();
      const { topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "CUSTOMERS/DATA_REQUEST") {
        console.warn(`Unexpected topic at /app/webhooks/customers/data_request: ${topic}`);
      }

      if (shop && payload) {
        Promise.resolve().then(async () => {
          await processWebhookSafely(
            webhookId,
            topic,
            shop,
            payload,
            async () => {
              // TODO: Implement real customer data export pipeline
              console.log(`CUSTOMERS/DATA_REQUEST payload for ${shop}:`, JSON.stringify(payload));
            }
          );
        });
      }
    } else {
      console.log("CUSTOMERS/DATA_REQUEST: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("CUSTOMERS/DATA_REQUEST: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben, um Retries zu vermeiden
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
