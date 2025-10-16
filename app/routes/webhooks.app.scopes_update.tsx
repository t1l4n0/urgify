import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

    if (hmac) {
      const { topic, shop, payload, session } = await authenticate.webhook(request);

      if (topic?.toUpperCase() !== "APP/SCOPES_UPDATE") {
        console.warn(`Unexpected topic at /app/webhooks/app/scopes_update: ${topic}`);
      }

      if (session && payload) {
        console.log(`APP/SCOPES_UPDATE: updating scopes for ${shop}`);
        
        // Asynchrone Verarbeitung ohne await → Response sofort zurückgeben
        Promise.resolve().then(async () => {
          try {
            const current = payload.current as string[];
            await prisma.session.update({
              where: { id: session.id },
              data: { scope: current.toString() },
            });
            console.log(`APP/SCOPES_UPDATE: scopes updated for ${shop}`);
          } catch (err) {
            console.error(`APP/SCOPES_UPDATE: update error for ${shop}`, err);
          }
        });
      }
    } else {
      console.log("APP/SCOPES_UPDATE: no HMAC (test request) → respond 200");
    }

    // Immer 200 OK innerhalb von 5s zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP/SCOPES_UPDATE: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben, um Retries zu vermeiden
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
