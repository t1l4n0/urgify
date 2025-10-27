import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncSubscriptionStatusToMetafield } from "../utils/billing";
import { processWebhookSafely } from "../utils/webhookHelpers";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const webhookId = request.headers.get("X-Shopify-Webhook-Id") || crypto.randomUUID();
      // Verifiziertes Webhook-Auth (HMAC, Shop, Topic, Payload)
      const { admin, topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "APP_SUBSCRIPTIONS/UPDATE") {
        console.warn(`Unexpected topic at /app/webhooks/app/subscriptions/update: ${topic}`);
      }

      if (shop) {
        // Asynchrone, idempotente Verarbeitung im Hintergrund; 200 sofort
        Promise.resolve().then(async () => {
          await processWebhookSafely(
            webhookId,
            topic,
            shop,
            payload,
            async () => {
              if (!admin) {
                console.error("Admin context not available for subscription sync");
                return;
              }
              
              // Shop-ID ermitteln und Metafield syncen
              const shopResponse = await admin.graphql(`
                query getShop { shop { id } }
              `);
              const shopData = await shopResponse.json();
              const shopId = shopData.data?.shop?.id;

              if (shopId) {
                await syncSubscriptionStatusToMetafield(admin, shopId);
              } else {
                console.error("Could not retrieve shop ID for subscription sync");
              }
            }
          );
        });
      }
    } else {
      console.log("APP_SUBSCRIPTIONS/UPDATE: no HMAC (test request) → respond 200");
    }

    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP_SUBSCRIPTIONS/UPDATE: webhook error:", err);
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
