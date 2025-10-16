import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const { topic, shop, payload } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "APP/UNINSTALLED") {
        console.warn(`Unexpected topic at /app/webhooks/app/uninstalled: ${topic}`);
      }

      if (shop) {
        console.log(`APP/UNINSTALLED: queuing cleanup for ${shop}`);
        
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
            console.log(`APP/UNINSTALLED: cleanup done for ${shop}`);
          } catch (err) {
            console.error(`APP/UNINSTALLED: cleanup error for ${shop}`, err);
          }
        });
      }
    } else {
      console.log("APP/UNINSTALLED: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP/UNINSTALLED: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben, um Retries zu vermeiden
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
