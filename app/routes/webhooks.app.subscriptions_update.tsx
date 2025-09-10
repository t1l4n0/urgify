import { authenticate } from "../shopify.server";
import { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin } = await authenticate.webhook(request);

  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  if (topic === "APP_SUBSCRIPTIONS_UPDATE") {
    try {
      const payload = await request.json();
      console.log("Subscription update received:", payload);
      
      // Hier können Sie Logik für die Behandlung von Abonnement-Updates implementieren
      // z.B. Datenbank-Updates, Benachrichtigungen, etc.
      
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing subscription update:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }

  return new Response("Unhandled webhook topic", { status: 400 });
};
