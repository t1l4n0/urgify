import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  console.log(`🏪 Shop Redact Webhook empfangen für Shop: ${shop}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  // Hier würde normalerweise die Shop-Datenlöschung implementiert werden
  // Für Compliance-Zwecke loggen wir nur die Anfrage
  
  return new Response(null, { status: 200 });
};
