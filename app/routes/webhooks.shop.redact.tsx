import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const { topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "SHOP/REDACT") {
        console.warn(`Unexpected topic at /app/webhooks/shop/redact: ${topic}`);
      }

      if (shop) {
        console.log(`SHOP/REDACT: queuing cleanup for ${shop}`);
        
        // Asynchrone Verarbeitung ohne await → Response sofort zurückgeben
        Promise.resolve().then(async () => {
          try {
            await prisma.$transaction([
              prisma.session.deleteMany({ where: { shop } }),
              prisma.quickstart.deleteMany({ where: { shop } }),
              prisma.quickstartProgress.deleteMany({ where: { shop } }),
              // Weitere Löschungen (alle Shop-spezifischen Daten):
              // - Metafields
              // - Subscription-Daten
              // - Logs mit Shop-Identifikation
              // - Jobs/Queues
            ]);
            console.log(`SHOP/REDACT: cleanup done for ${shop}`);
          } catch (err) {
            console.error(`SHOP/REDACT: cleanup error for ${shop}`, err);
          }
        });
      }
    } else {
      console.log("SHOP/REDACT: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("SHOP/REDACT: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben, um Retries zu vermeiden
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
