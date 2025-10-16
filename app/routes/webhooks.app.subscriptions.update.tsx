import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
    
    if (hmac) {
      console.log("APP_SUBSCRIPTIONS/UPDATE: webhook received with HMAC");
      // TODO: Implement proper webhook authentication and processing
    } else {
      console.log("APP_SUBSCRIPTIONS/UPDATE: test request without HMAC");
    }

    // Immer 200 OK zurückgeben
    return json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("APP_SUBSCRIPTIONS/UPDATE: webhook error:", err);
    // Auch bei Fehler 200 zurückgeben
    return json({ ok: true }, { status: 200 });
  }
};

export const loader = () => new Response(null, { status: 405 });
