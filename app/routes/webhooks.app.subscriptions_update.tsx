import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const { topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "APP_SUBSCRIPTIONS/UPDATE") {
        console.warn(`Unexpected topic at /app/webhooks/app/subscriptions_update: ${topic}`);
      }

      if (shop && payload) {
        console.log(`APP_SUBSCRIPTIONS/UPDATE: queuing update for ${shop}`);
        
        // Asynchrone Verarbeitung ohne await → Response sofort zurückgeben
        Promise.resolve().then(async () => {
          try {
            console.log(`APP_SUBSCRIPTIONS/UPDATE payload for ${shop}:`, JSON.stringify(payload));
            // TODO: Subscription-Status in DB speichern
            // await prisma.subscription.upsert({
            //   where: { shop },
            //   update: { status: payload.status, ... },
            //   create: { shop, status: payload.status, ... }
            // });
          } catch (err) {
            console.error(`APP_SUBSCRIPTIONS/UPDATE: processing error for ${shop}`, err);
          }
        });
      }
    } else {
      console.log("APP_SUBSCRIPTIONS/UPDATE: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP_SUBSCRIPTIONS/UPDATE: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben, um Retries zu vermeiden
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
